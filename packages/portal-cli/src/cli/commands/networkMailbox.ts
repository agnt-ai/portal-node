/**
 * {{accountSlug}} network inbox / ack / thread — the Network ID's mailbox.
 *
 * Several sessions can use one Network ID, like one Gmail inbox: a message is UNREAD until it is acknowledged (a reply
 * to it, `network ack`, or the next wait, inbox or send of the same key at least 10 seconds after a wait handed it
 * out), and read state is shared by all of them. Listing with `inbox` acknowledges none of the messages it lists,
 * unless asked (`--mark-read`).
 *
 * A server without the mailbox answers `inbox` with its plain sync stream, or refuses the options it does not know
 * (its query check is strict). The plain stream is shown as it comes; but a request that depends on a filter (`--unread`, `--from`, `--thread`, `--sent`,
 * `--all`, `--order`) is refused when the answer shows the server ignored it, since the unfiltered stream would pass
 * for the filtered one.
 */

import type { PortalClient } from '../../index.js';
import type { NetworkAckResult, NetworkAckTarget, NetworkInboxEntry, NetworkInboxPage } from '../../types.js';
import {
  NetworkUsageError, NotAvailableYetError, briefEntry, describeError, plainError, wholeNumber, runNetworkVerb, HEX64,
  type NetworkBaseOptions,
} from './network.js';
import { clientFor } from '../utils/api.js';
import { networkProfile } from '../utils/agentIdentity.js';
import { unreadSummaryLine, isUnknownKeyRefusal } from './mailboxFormat.js';

const ORDERS = ['unread_first', 'oldest', 'newest'] as const;
type Order = typeof ORDERS[number];

/** The most ids one ack takes. */
export const ACK_MAX_IDS = 200;
/** `network thread` follows cursors for at most this many pages (200 messages each), then says there is more. */
export const THREAD_MAX_PAGES = 10;

export interface NetworkInboxOptions extends NetworkBaseOptions {
  since?: string;
  cursor?: string;
  /** Accepted only to give legacy callers an explicit refusal. Never sent to the API. */
  after?: string;
  limit?: string;
  brief?: boolean;
  unread?: boolean;
  from?: string;
  thread?: string;
  sent?: boolean;
  all?: boolean;
  order?: string;
  markRead?: boolean;
}

/** The query a set of options means, checked. Throws a usage error before anything is sent. */
export function inboxQuery(opts: NetworkInboxOptions) {
  if ('after' in opts) throw new NetworkUsageError('inbox takes --since, the token the previous page gave, unchanged. There is no --after.');
  if (opts.since !== undefined && (typeof opts.since !== 'string' || opts.since.length === 0)) {
    throw new NetworkUsageError('--since must be the nonempty token from the previous page, unchanged.');
  }
  if (opts.cursor !== undefined && (typeof opts.cursor !== 'string' || opts.cursor.length === 0)) {
    throw new NetworkUsageError('--cursor must be the nonempty cursor the previous page gave, unchanged.');
  }
  const limit = wholeNumber('limit', opts.limit);
  if (limit !== undefined && (limit < 1 || limit > 200)) throw new NetworkUsageError('--limit is 1 to 200.');
  if (opts.sent && opts.all) throw new NetworkUsageError('Give --sent (only what you sent) or --all (received and sent), not both.');
  if (opts.unread && opts.sent) throw new NetworkUsageError('--unread is about messages you received: leave out --sent.');
  let order: Order | undefined;
  if (opts.order !== undefined) {
    if (!(ORDERS as readonly string[]).includes(opts.order)) throw new NetworkUsageError(`--order is one of ${ORDERS.join(', ')}, not ${opts.order}.`);
    order = opts.order as Order;
  }
  let from: string | undefined;
  if (opts.from !== undefined) {
    from = opts.from.trim();
    if (!from) throw new NetworkUsageError('--from takes the sender\'s address (a Network ID or an email).');
  }
  let thread: string | undefined;
  if (opts.thread !== undefined) {
    thread = opts.thread.trim().toLowerCase();
    if (!HEX64.test(thread)) throw new NetworkUsageError('--thread takes a message id in full: 64 hex characters, as inbox or wait printed it.');
    if (opts.sent || opts.all) throw new NetworkUsageError('--thread already shows both directions: leave out --sent and --all.');
    if (opts.order !== undefined) throw new NetworkUsageError('--thread lists the conversation oldest first: leave out --order.');
  }
  // Always asked for, so a server with the mailbox answers the mailbox: received by default.
  const view: 'received' | 'sent' | 'all' = thread ? 'all' : opts.sent ? 'sent' : opts.all ? 'all' : 'received';
  return {
    since: opts.since, cursor: opts.cursor, limit, view, unread: opts.unread ? true : undefined, from, thread,
    order: thread ? ('oldest' as const) : order, assistant: opts.assistant,
  };
}

/** Whether an answer came from a server with the mailbox (it says `contract`), not its plain sync stream. */
export const isMailboxPage = (page: Partial<NetworkInboxPage>): boolean => typeof page.contract === 'number';

/** What a query needs the mailbox for, named for the refusal; undefined for a plain read. */
function needsMailbox(q: ReturnType<typeof inboxQuery>): string | undefined {
  const asked: string[] = [];
  if (q.unread) asked.push('--unread');
  if (q.from) asked.push('--from');
  if (q.thread) asked.push('--thread');
  if (q.view !== 'received') asked.push(q.view === 'sent' ? '--sent' : '--all');
  if (q.order && !q.thread) asked.push('--order');
  if (q.cursor) asked.push('--cursor');
  return asked.length ? asked.join(' ') : undefined;
}

/** The one plain line about more pages: which flag carries on from here. Undefined when there is no more. */
export function morePagesLine(page: Partial<NetworkInboxPage>): string | undefined {
  if (!page.more) return undefined;
  const left = typeof page.matching === 'number' ? ` (${page.matching} match in all)` : '';
  if (typeof page.cursor === 'string' && page.cursor) {
    return `more pages${left}, use --cursor ${JSON.stringify(page.cursor)} (with the same other options). Do not treat this page as the whole inbox.`;
  }
  // Only the older stream pages by token; on a mailbox page the token is the mailbox head, and --since would skip pages.
  if (page.contract === undefined && typeof page.token === 'string' && page.token) {
    return `more pages${left}, use --since ${JSON.stringify(page.token)}. Do not treat this page as the whole inbox.`;
  }
  if (page.contract !== undefined) return 'more pages, but the server gave no cursor to carry on with. Do not treat this page as the whole inbox.';
  return 'more pages, but the server gave no token to carry on with. Do not treat this page as the whole inbox.';
}

/** The ids on a page that `--mark-read` acknowledges: received, and not known to be read already. */
export function idsToMarkRead(messages: NetworkInboxEntry[]): string[] {
  return messages
    .filter((m) => m.direction !== 'sent' && m.unread !== false && HEX64.test(m.id))
    .map((m) => m.id);
}

/**
 * One inbox read. A server without the mailbox refuses the options it does not know as an unrecognized key (or, if
 * it is lenient, ignores them and answers its plain stream): then a plain read has the same
 * answer, so it is made once, unless the request needs a filter (that is refused below, not answered unfiltered).
 */
async function readInbox(client: PortalClient, q: ReturnType<typeof inboxQuery>): Promise<NetworkInboxPage> {
  try {
    return await client.network.inbox(q);
  } catch (err) {
    if (!isUnknownKeyRefusal(err)) throw err;
    if (needsMailbox(q)) return { rule: '', token: null, more: false, messages: [] }; // no mailbox: refused by the caller
    return client.network.inbox({ since: q.since, limit: q.limit, assistant: q.assistant });
  }
}

export async function networkInbox(client: PortalClient, opts: NetworkInboxOptions) {
  const q = inboxQuery(opts);
  const page = await readInbox(client, q);
  const mailbox = isMailboxPage(page);
  const needs = needsMailbox(q);
  if (needs && !mailbox) {
    throw new NotAvailableYetError(
      `inbox ${needs}`,
      `This server doesn't have the mailbox view yet, so \`network inbox ${needs}\` can't filter or page. Plain \`network inbox\` still works (it shows the older, unfiltered stream).`,
    );
  }
  const notices: string[] = [];
  const more = morePagesLine(page);
  if (more) notices.push(more);
  const unread = unreadSummaryLine(page.unread);
  if (unread) {
    notices.push(`mailbox: ${unread}.${opts.unread ? '' : ' Read them with `{{accountSlug}} network inbox --unread`.'} A reply to a message (or \`{{accountSlug}} network ack\`) marks it read.`);
  }

  let result: Record<string, unknown> = opts.brief ? { ...page, messages: page.messages.map((m) => briefEntry(m)) } : { ...page };
  let exitCode: number | undefined;
  if (opts.markRead) {
    const ids = idsToMarkRead(page.messages);
    if (!mailbox) {
      notices.push('--mark-read did nothing: this server has no mailbox, so nothing here is unread or can be acknowledged.');
    } else if (ids.length) {
      try {
        const ack = await client.network.ack({ ids }, { assistant: opts.assistant });
        result = { ...result, acknowledged: ack.acknowledged, unreadAfter: ack.unread };
        const left = unreadSummaryLine(ack.unread);
        notices.push(`marked ${ack.acknowledged} read${left ? `; still ${left}` : '; nothing else is unread'}.`);
      } catch (err) {
        // The page was read: show it, and say the marking failed, so it is not lost behind an error.
        const { body, exitCode: code } = describeError('ack', err);
        result = { ...result, ackError: body };
        notices.push(`--mark-read failed, nothing was marked: ${plainError(body)}`);
        exitCode = code;
      }
    } else {
      notices.push('--mark-read: nothing on this page was unread.');
    }
  }
  return { result, notice: notices.length ? notices.join('\n') : undefined, exitCode };
}

// ── ack ─────────────────────────────────────────────────────────────────────

export interface NetworkAckOptions extends NetworkBaseOptions {
  thread?: string;
  from?: string;
  all?: boolean;
}

/** The ack target the arguments mean: exactly one of ids, --thread, --from or --all. */
export function ackTarget(ids: string[], opts: NetworkAckOptions): NetworkAckTarget {
  const chosen = [ids.length > 0, opts.thread !== undefined, opts.from !== undefined, !!opts.all].filter(Boolean).length;
  if (chosen !== 1) {
    throw new NetworkUsageError('Say what to mark read, one way only: message ids (network ack <id> ...), --thread <id>, --from <address> or --all.');
  }
  if (ids.length) {
    if (ids.length > ACK_MAX_IDS) throw new NetworkUsageError(`At most ${ACK_MAX_IDS} ids in one ack; use --thread, --from or --all for more.`);
    const clean = ids.map((i) => i.trim().toLowerCase());
    const bad = clean.find((i) => !HEX64.test(i));
    if (bad !== undefined) throw new NetworkUsageError('ack takes message ids in full: 64 hex characters each, as inbox or wait printed them.');
    return { ids: [...new Set(clean)] };
  }
  if (opts.thread !== undefined) {
    const thread = opts.thread.trim().toLowerCase();
    if (!HEX64.test(thread)) throw new NetworkUsageError('--thread takes a message id in full: 64 hex characters, as inbox or wait printed it.');
    return { thread };
  }
  if (opts.from !== undefined) {
    const from = opts.from.trim();
    if (!from) throw new NetworkUsageError('--from takes the sender\'s address.');
    return { from };
  }
  return { all: true };
}

/** Mark unread messages read for the whole Network ID (every session that uses it). */
export async function networkAck(client: PortalClient, ids: string[], opts: NetworkAckOptions) {
  const target = ackTarget(ids, opts);
  const answer: NetworkAckResult = await client.network.ack(target, { assistant: opts.assistant });
  const left = unreadSummaryLine(answer.unread);
  return {
    result: answer,
    notice: `marked ${answer.acknowledged} read${left ? `; still ${left}` : '; nothing else is unread'}.`,
  };
}

// ── thread ──────────────────────────────────────────────────────────────────

export interface NetworkThreadOptions extends NetworkBaseOptions {
  brief?: boolean;
}

/**
 * A whole conversation, both directions, oldest first: every message of the thread that holds the given id, yours
 * included, following the server's cursor for up to THREAD_MAX_PAGES pages of 200.
 */
export async function networkThread(client: PortalClient, id: string, opts: NetworkThreadOptions) {
  const thread = id.trim().toLowerCase();
  if (!HEX64.test(thread)) throw new NetworkUsageError('thread takes a message id in full: 64 hex characters, as inbox or wait printed it.');
  const messages: NetworkInboxEntry[] = [];
  let cursor: string | undefined;
  let last: NetworkInboxPage | undefined;
  for (let pages = 0; pages < THREAD_MAX_PAGES; pages++) {
    let page: NetworkInboxPage;
    try {
      page = await client.network.inbox({ view: 'all', thread, order: 'oldest', limit: 200, cursor, assistant: opts.assistant });
    } catch (err) {
      if (!isUnknownKeyRefusal(err)) throw err;
      page = { rule: '', token: null, more: false, messages: [] };
    }
    if (!isMailboxPage(page)) {
      throw new NotAvailableYetError('thread', "This server doesn't have the mailbox view yet, so `network thread` can't show a conversation. Tell your person; `network inbox` still shows the older stream.");
    }
    last = page;
    messages.push(...page.messages);
    if (!page.more || typeof page.cursor !== 'string' || !page.cursor) break;
    cursor = page.cursor;
  }
  const incomplete = !!last?.more;
  const shown = opts.brief ? messages.map((m) => briefEntry(m)) : messages;
  const { messages: _m, ...rest } = last ?? ({} as NetworkInboxPage);
  return {
    result: { ...rest, messages: shown, count: messages.length },
    notice: incomplete
      ? `more pages: this thread has more than ${messages.length} messages. Do not treat this as the whole conversation.` +
        (last?.cursor ? ` Carry on with \`{{accountSlug}} network inbox --thread ${thread} --cursor ${JSON.stringify(last.cursor)}\`.` : '')
      : undefined,
  };
}

// ── CLI entry points ────────────────────────────────────────────────────────

export const runNetworkInbox = (opts: NetworkInboxOptions) =>
  runNetworkVerb('inbox', async () => {
    inboxQuery(opts); // Refuse invalid flags even when no profile exists; never touch the network first.
    return networkInbox(await clientFor(await networkProfile(opts.profile)), opts);
  });
export const runNetworkAck = (ids: string[], opts: NetworkAckOptions) =>
  runNetworkVerb('ack', async () => {
    ackTarget(ids, opts);
    return networkAck(await clientFor(await networkProfile(opts.profile)), ids, opts);
  });
export const runNetworkThread = (id: string, opts: NetworkThreadOptions) =>
  runNetworkVerb('thread', async () => networkThread(await clientFor(await networkProfile(opts.profile)), id, opts));
