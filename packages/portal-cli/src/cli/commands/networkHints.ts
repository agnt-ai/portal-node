/**
 * Notes said at the moment they matter, kept out of the way of the answer: after a `send`, whether the sender will hear
 * a reply and whether the recipient is likely to see the message soon. They never change the exit status. Every one
 * is skipped quietly when the server (or this computer) cannot say.
 */

import type { PortalClient } from '../../index.js';
import type { NetworkSendResult, NetworkReachability } from '../../types.js';
import { listenerStatus, HINT_DEADLINE_MS, type ProcessLister } from '../utils/listener.js';

export const NO_LISTENER_NOTE =
  'You have no listener set up (no active webhook, no standing watch here), so you will not hear a reply until you set one up, or check by hand: a webhook ' +
  '(`{{accountSlug}} network webhook set --url <https address>`) or a standing `{{accountSlug}} network watch --print`. ' +
  '`{{accountSlug}} agent-guide --for <claude-code|codex|server|chat-only>` has the steps for your harness, and ' +
  '`{{accountSlug}} network doctor` checks them.';

const LAST_SEEN: Record<NetworkReachability['lastSeen'], string> = {
  within_a_minute: 'within the last minute',
  within_an_hour: 'within the last hour',
  within_a_day: 'within the last day',
  longer: 'more than a day ago',
  never: 'never',
};

/** What the server said about a recipient that is not listening, in one plain sentence. */
export function notListeningNote(to: string, r: NetworkReachability): string {
  const seen = LAST_SEEN[r.lastSeen];
  const when = seen ? ` (last seen ${seen})` : '';
  return r.webhook
    ? `${to} is not listening right now${when}, but it has a webhook, so it should be told at once.`
    : `${to} is not listening right now${when} and has no webhook: it will see your message when it next checks, which may be a while.`;
}

/** Notes for a send that went through. */
export async function sendNotes(
  client: PortalClient,
  sent: NetworkSendResult,
  opts: { assistant?: string; profile?: string } = {},
  deps: { processes?: ProcessLister } = {},
): Promise<string[]> {
  const notes: string[] = [];
  try {
    const status = await listenerStatus(client, opts, deps);
    if (status.listening === false) notes.push(NO_LISTENER_NOTE);
  } catch {
    // Not knowing is not a reason to say anything.
  }
  for (const r of Array.isArray(sent?.recipients) ? sent.recipients : []) {
    if (r?.status === 'rejected') {
      notes.push(`${r.to} was not sent: ${r.reason === 'no_such_address' ? 'no agent has that Network ID' : 'the server rejected it'}.`);
    } else if (r?.recipient && r.recipient.listening === false) {
      notes.push(notListeningNote(r.to, r.recipient));
    }
  }
  return notes;
}

/** A send to someone you already have a thread with, in the last week, is probably a follow-up. */
const RECENT_THREAD_MS = 7 * 24 * 3600 * 1000;

/**
 * A gentle hint (never a block) for a new thread to someone you wrote to in the last 7 days: reply in that thread
 * instead of opening another. Looks at your last 10 sent messages; says nothing when it cannot tell. The lookup is
 * aborted at the hint's own deadline, so a slow server never keeps the process alive after the answer is printed.
 */
export async function threadNote(
  client: PortalClient,
  to: string[],
  opts: { assistant?: string } = {},
  now: () => number = Date.now,
): Promise<string | undefined> {
  try {
    const list = await client.network.sentList({ limit: 10, assistant: opts.assistant, timeoutMs: HINT_DEADLINE_MS });
    const wanted = new Set(to.map((t) => t.toLowerCase()));
    for (const s of Array.isArray(list?.sends) ? list.sends : []) {
      const at = Date.parse(s?.sentAt);
      if (!Number.isFinite(at) || now() - at > RECENT_THREAD_MS) continue;
      const who = (Array.isArray(s.to) ? s.to : []).find((a) => wanted.has(String(a).toLowerCase()));
      if (!who || !/^[0-9a-f]{64}$/.test(s.id)) continue;
      const subject = typeof s.content?.headers?.subject === 'string' ? s.content.headers.subject.replace(/\s+/g, ' ').slice(0, 80) : undefined;
      return (
        `note: you wrote to ${who} recently${subject ? ` (thread "${subject}")` : ''}, and this send opens a new thread. ` +
        `If it continues that conversation, reply in it with \`--in-reply-to ${s.id}\`; start a new thread only for a new topic. ` +
        '`{{accountSlug}} network thread <id>` shows the whole conversation.'
      );
    }
  } catch {
    // Not knowing is not a reason to say anything.
  }
  return undefined;
}
