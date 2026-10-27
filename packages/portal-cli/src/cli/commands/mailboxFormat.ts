/**
 * Plain-text lines about the mailbox (what is unread, how a send went), for stderr and for monitors. A leaf: it
 * imports nothing from the other network commands, so any of them can use it.
 *
 * Everything here is built from values another party can influence (a sender's address, a bounce's reason), so each
 * is checked against a strict shape before it is printed, and a value that does not fit is left out, never quoted.
 */

import { AgntApiError } from '../../HttpClient.js';
import type { NetworkUnreadSummary, NetworkSendRecipient, NetworkSentRecipient } from '../../types.js';

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * A claimed sender for a monitor or status line: only an address-shaped value (letters, digits and . _ % + @ : -), at
 * most 120 characters, else null. Another party's text must not ride in on the line, so no sentence can pass.
 */
export function senderForLine(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9._%+@:-]{1,120}$/.test(value) ? value : null;
}

/** A message id for a line: 64 hex digits, else null. */
export function idForLine(value: unknown): string | null {
  return typeof value === 'string' && HEX64.test(value) ? value : null;
}

/** A timestamp for a line: ISO-looking characters only, else null. */
export function timeForLine(value: unknown): string | null {
  return typeof value === 'string' && /^[0-9TZ:.+-]{10,40}$/.test(value) ? value : null;
}

/** A whole, non-negative count, else 0. */
function count(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

export interface UnreadForLine {
  count: number;
  /** Address-shaped senders with their counts, most first, at most `max`. */
  senders: Array<{ from: string; count: number }>;
  /** Unread messages from senders not listed (more senders, or a value that was not address-shaped). */
  others: number;
  oldest: string | null;
}

/** An `unread` summary from the server, cut down to what may be printed. Undefined when it is not one. */
export function unreadForLine(unread: Partial<NetworkUnreadSummary> | undefined | null, max = 5): UnreadForLine | undefined {
  if (!unread || typeof unread !== 'object') return undefined;
  const total = count(unread.count);
  const raw = unread.senders && typeof unread.senders === 'object' ? Object.entries(unread.senders) : [];
  const named: Array<{ from: string; count: number }> = [];
  for (const [from, n] of raw) {
    const safe = senderForLine(from);
    if (safe && count(n) > 0) named.push({ from: safe, count: count(n) });
  }
  named.sort((a, b) => b.count - a.count);
  const shown = named.slice(0, max);
  const shownTotal = shown.reduce((sum, s) => sum + s.count, 0);
  return { count: total, senders: shown, others: Math.max(0, total - shownTotal), oldest: timeForLine(unread.oldest) };
}

/** "3 unread from alice@x (2), bob@y and 1 more", or undefined when nothing is unread. */
export function unreadSummaryLine(unread: Partial<NetworkUnreadSummary> | undefined | null, opts: { other?: boolean } = {}): string | undefined {
  const u = unreadForLine(unread);
  if (!u || u.count === 0) return undefined;
  const who = u.senders.map((s) => (s.count > 1 ? `${s.from} (${s.count})` : s.from));
  const from = who.length
    ? ` from ${who.join(', ')}${u.others > 0 ? ` and ${u.others} more` : ''}`
    : '';
  return `${u.count}${opts.other ? ' other' : ''} unread${from}`;
}

const SEND_STATUS = new Set(['accepted', 'rejected', 'pending', 'delivered', 'bounced']);

/**
 * How each recipient of a send is doing, in one line: "bob@x accepted, carol@y rejected (no such address)". Only the
 * address, a known status and, for a rejection, the one reason the network gives are printed; undefined for nothing.
 */
export function deliveryLine(recipients: Array<NetworkSendRecipient | NetworkSentRecipient> | undefined): string | undefined {
  if (!Array.isArray(recipients) || recipients.length === 0) return undefined;
  const parts = recipients.map((r) => {
    const to = senderForLine(r?.to) ?? 'a recipient';
    const status = typeof r?.status === 'string' && SEND_STATUS.has(r.status) ? r.status : 'unknown';
    const why = r?.reason === 'no_such_address' ? ' (no such address)' : '';
    return `${to} ${status}${why}`;
  });
  return parts.join(', ');
}

/** Whether any recipient of a send was rejected. */
export function anyRejected(recipients: Array<{ status?: unknown }> | undefined): boolean {
  return Array.isArray(recipients) && recipients.some((r) => r?.status === 'rejected');
}

/**
 * Whether an error is a server saying it does not know a query key we sent: a 400 "Unrecognized key". A server
 * without the mailbox checks the inbox query strictly, so the mailbox options (`view`, `digest`, ...) are refused
 * there instead of ignored. That is the signal to fall back to the plain read; a 400 about a value (a bad cursor, a
 * malformed id) is a real error and is not this.
 */
export function isUnknownKeyRefusal(err: unknown): boolean {
  return err instanceof AgntApiError && err.status === 400 && /unrecognized key/i.test(err.message ?? '');
}
