/**
 * {{accountSlug}} network watch --print, on a server with the mailbox: a backlog digest first, then live events.
 *
 *   1. One call to `inbox?digest=true`: how many messages are unread, from whom, since when, and the mailbox token.
 *      It prints as ONE `backlog` event, so a monitor wakes once for a backlog instead of once per old message.
 *   2. Then it follows from that token: `inbox?view=received&since=<token>&order=oldest`, keeping the token each
 *      answer gives, one `message` event per new message (a bounce is a `message` event with kind "bounce").
 *
 * Reading never acknowledges anything: the agent reads a message with `network inbox`, and it is marked read when the
 * agent replies in its thread or runs `network ack`. A watch is not the one who has "seen" it.
 *
 * Every line names the message and who sent it, never what it says: the claimed sender shows only if it is
 * address-shaped, the id only if it is 64 hex digits (see mailboxFormat). Nothing another party wrote rides in.
 *
 * Against a server without the mailbox the digest call answers a plain page (no `digest`), and this returns 'legacy':
 * the caller then runs its older loop on `wait`.
 */

import type { PortalClient } from '../../index.js';
import type { NetworkInboxDigest, NetworkInboxEntry, NetworkInboxPage } from '../../types.js';
import { describeError, type WaitClock } from './network.js';
import { idForLine, senderForLine, timeForLine, unreadForLine, isUnknownKeyRefusal } from './mailboxFormat.js';

/** How long between polls of the mailbox. Each poll counts as listening for the senders who look. */
export const FOLLOW_POLL_SECONDS = 5;
/** The longest pause after a failure that may pass. */
const FOLLOW_MAX_BACKOFF_SECONDS = 30;
/** Failures in a row that may pass before a `--drain` gives up (it is run by a scheduler). */
const FOLLOW_DRAIN_MAX_RETRIES = 3;
/** How many senders a backlog event names. */
const BACKLOG_SENDERS = 10;

export interface FollowOptions {
  from?: string;
  drain?: boolean;
  assistant?: string;
}

export interface FollowDeps {
  clock: WaitClock;
  stopped: () => boolean;
  emit: (event: Record<string, unknown>) => void;
}

const isDigest = (answer: NetworkInboxDigest | NetworkInboxPage): answer is NetworkInboxDigest =>
  !!(answer as NetworkInboxDigest).digest && typeof (answer as NetworkInboxDigest).digest === 'object';

/** The `backlog` event for a digest. */
export function backlogEvent(digest: NetworkInboxDigest['digest']): Record<string, unknown> {
  const u = unreadForLine(digest, BACKLOG_SENDERS);
  const ids = Array.isArray(digest.ids) ? digest.ids.map((i) => idForLine(i)).filter((i): i is string => i !== null) : [];
  return {
    event: 'backlog',
    unread: u?.count ?? 0,
    senders: Object.fromEntries((u?.senders ?? []).map((s) => [s.from, s.count])),
    otherSenders: u?.others ?? 0,
    oldest: u?.oldest ?? null,
    ids,
    idsTruncated: digest.idsTruncated === true,
    read: '{{accountSlug}} network inbox --unread',
  };
}

/** The `message` event for one received entry: who and which, never what it says. */
export function messageEvent(entry: NetworkInboxEntry, more: boolean): Record<string, unknown> {
  const bounce = entry.kind === 'bounce';
  return {
    event: 'message',
    id: idForLine(entry.id),
    kind: bounce ? 'bounce' : 'message',
    from: bounce ? 'network' : senderForLine(entry.message?.untrusted?.from),
    receivedAt: timeForLine(entry.receivedAt),
    verified: bounce ? null : entry.sender?.verified ?? null,
    relation: bounce ? null : entry.sender?.relation ?? null,
    newSender: entry.newSender === true,
    // A bounce: which send did not arrive, and to whom.
    ...(bounce ? { about: idForLine(entry.bounce?.sendId), to: senderForLine(entry.bounce?.to) } : {}),
    more,
  };
}

/**
 * Follow the mailbox. Returns the number of message events printed, or 'legacy' when the server has no mailbox (nothing
 * was printed). A failure that may pass backs off and keeps going; any other failure throws.
 */
export async function followMailbox(client: PortalClient, opts: FollowOptions, deps: FollowDeps): Promise<number | 'legacy'> {
  const { clock, stopped, emit } = deps;
  let token: string | null = null;
  let started = false;
  let handled = 0;
  let backoff = 1;
  let failures = 0;
  // Ids already printed (the most recent few hundred): a token that did not move must not print a message twice.
  const seen = new Set<string>();

  // A failure that may pass: wait and go on. Out of retries on a drain, the failure itself ends the run.
  const pause = async (err: unknown): Promise<void> => {
    const { body } = describeError('watch', err);
    if (!body.retryable) throw err;
    if (opts.drain && ++failures > FOLLOW_DRAIN_MAX_RETRIES) throw err;
    const seconds = Math.min(Math.max(body.retryAfter ?? backoff, 1), 300);
    emit({ event: 'retrying', code: body.code, inSeconds: seconds });
    await clock.sleep(seconds * 1000);
    backoff = Math.min(backoff * 2, FOLLOW_MAX_BACKOFF_SECONDS);
  };

  while (!stopped()) {
    if (!started) {
      let answer: NetworkInboxDigest | NetworkInboxPage;
      try {
        answer = await client.network.inboxDigest({ assistant: opts.assistant });
        backoff = 1; failures = 0;
      } catch (err) {
        // A server whose inbox check is strict refuses `digest` as an unknown key: it has no mailbox.
        if (isUnknownKeyRefusal(err)) return 'legacy';
        await pause(err);
        continue;
      }
      if (!isDigest(answer)) return 'legacy';
      emit(backlogEvent(answer.digest));
      started = true;
      token = typeof answer.token === 'string' && answer.token ? answer.token : null;
      // A drain prints what is waiting and ends: the digest is that.
      if (opts.drain) return handled;
      continue;
    }
    if (token === null) {
      // The mailbox has no position yet (no address): ask again for it, quietly, rather than read from the start.
      try {
        const again = await client.network.inboxDigest({ assistant: opts.assistant });
        backoff = 1; failures = 0;
        if (isDigest(again) && typeof again.token === 'string' && again.token) token = again.token;
      } catch (err) {
        await pause(err);
        continue;
      }
      if (token === null) await clock.sleep(FOLLOW_POLL_SECONDS * 1000);
      continue;
    }
    let page: NetworkInboxPage;
    const asked = clock.now();
    try {
      page = await client.network.inbox({ view: 'received', since: token, order: 'oldest', assistant: opts.assistant });
      backoff = 1; failures = 0;
    } catch (err) {
      await pause(err);
      continue;
    }
    const entries = (page.messages ?? []).filter((m) => m.direction !== 'sent');
    const want = opts.from?.trim().toLowerCase();
    entries.forEach((entry, i) => {
      if (seen.has(entry.id)) return;
      seen.add(entry.id);
      if (seen.size > 500) seen.delete(seen.values().next().value as string);
      // --from narrows the lines, not the mailbox: nothing is acknowledged or hidden on the server's side.
      if (want && senderForLine(entry.message?.untrusted?.from)?.toLowerCase() !== want) return;
      emit(messageEvent(entry, i < entries.length - 1 || page.more === true));
      handled++;
    });
    if (typeof page.token === 'string' && page.token) token = page.token;
    // More pages behind this one: carry on at once; otherwise wait out the poll interval.
    if (page.more === true && entries.length > 0) continue;
    const elapsed = clock.now() - asked;
    const rest = FOLLOW_POLL_SECONDS * 1000 - elapsed;
    if (rest > 0 && !stopped()) await clock.sleep(rest);
  }
  return handled;
}
