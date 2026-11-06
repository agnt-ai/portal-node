/**
 * {{accountSlug}} network listen — take new mail. The one read an agent needs to hold a conversation.
 *
 * It hands over what is unread, oldest first, as a batch: messages, and bounces (the network saying a send of yours
 * did not arrive). Everything it hands over is read from then on, so there is nothing to acknowledge and nothing comes
 * back. Anyone who has this agent's address can write to it, so a stranger's first message arrives here too. With
 * nothing unread it waits, in server calls of up to WAIT_CALL_SECONDS, until something arrives or --timeout runs out.
 * A lost answer is not handed out again: `network inbox` (all mail, changes nothing) finds it.
 *
 * Exit status: 0 a batch, 3 nothing arrived in --timeout, 75 a failure that may pass, 1 a server without listen.
 */

import type { PortalClient } from '../../index.js';
import type { NetworkListenResult } from '../../types.js';
import {
  runNetworkVerb, describeError, wholeNumber, withNetworkDomain, NetworkUsageError, EXIT_WAIT_TIMEOUT, WAIT_CALL_SECONDS,
  type NetworkBaseOptions, type WaitClock,
} from './network.js';
import { unreadSummaryLine } from './mailboxFormat.js';
import { clientFor } from '../utils/api.js';
import { networkProfile } from '../utils/agentIdentity.js';

/** The most items one listen hands over: the server's own cap. */
export const LISTEN_MAX_LIMIT = 50;
/** How long listen waits when nothing is unread and no --timeout is given: the 20 seconds the card promises. */
export const LISTEN_DEFAULT_TIMEOUT = 20;
/** The longest pause between listen calls after a failure that may pass. */
const LISTEN_MAX_BACKOFF_SECONDS = 30;

export interface NetworkListenOptions extends NetworkBaseOptions {
  from?: string;
  timeout?: string;
  limit?: string;
}

const realClock: WaitClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * The plain line on stderr after a listen: the server's own `hint` when it gave one, else what the answer means and
 * what to do next. Built from checked values only, never from what another party wrote.
 */
export function listenNotice(got: NetworkListenResult): string {
  if (got.hint) return `note: ${got.hint}`;
  if (got.status === 'empty') return 'note: nothing unread. This call already waited, so run listen again to keep waiting; never call it in a faster loop.';
  const n = got.messages.length;
  const rest = unreadSummaryLine(got.unread);
  return `note: ${n === 1 ? 'This message is' : `These ${n} messages are`} now read: nothing to acknowledge. ` +
    (got.more || rest
      ? `${rest ? `More waiting: ${rest}.` : 'More is unread.'} Handle these, then run listen again at once.`
      : 'Handle these, then run listen again to wait for more.');
}

/**
 * Listen up to --timeout seconds (LISTEN_DEFAULT_TIMEOUT by default) for a batch of new mail, by repeated server calls of at most
 * WAIT_CALL_SECONDS each. A failure that may pass (a 429, a 503, no answer) backs off (Retry-After when given) and keeps
 * listening until the deadline. A server without listen is said plainly (not_available_yet), never answered with wait.
 */
export async function networkListen(client: PortalClient, opts: NetworkListenOptions, clock: WaitClock = realClock) {
  const timeout = wholeNumber('timeout', opts.timeout) ?? LISTEN_DEFAULT_TIMEOUT;
  const limit = wholeNumber('limit', opts.limit);
  if (limit !== undefined && (limit < 1 || limit > LISTEN_MAX_LIMIT)) throw new NetworkUsageError(`--limit is a whole number from 1 to ${LISTEN_MAX_LIMIT}.`);
  const from = opts.from ? (await withNetworkDomain(client, [opts.from.trim()], opts.assistant))[0] : opts.from;
  const started = clock.now();
  const deadline = started + timeout * 1000;
  let backoff = 1;
  let polled = false;
  let failing: unknown;
  let last: NetworkListenResult | undefined;

  for (;;) {
    const perCall = Math.max(0, Math.min(WAIT_CALL_SECONDS, Math.floor((deadline - clock.now()) / 1000)));
    // Under a second left: one last zero-second call only if there has been none (--timeout 0).
    if (perCall === 0 && polled) break;
    polled = true;
    const callStarted = clock.now();
    let got: NetworkListenResult;
    try {
      got = await client.network.listen({ from, timeout: perCall, limit, assistant: opts.assistant });
      backoff = 1;
      failing = undefined;
    } catch (err) {
      const { body } = describeError('listen', err);
      if (!body.retryable) throw err;
      failing = err;
      const pauseMs = Math.min(Math.max(body.retryAfter ?? backoff, 1) * 1000, Math.max(0, deadline - clock.now()));
      backoff = Math.min(backoff * 2, LISTEN_MAX_BACKOFF_SECONDS);
      if (pauseMs <= 0) break;
      await clock.sleep(pauseMs);
      continue;
    }
    if (got.status === 'messages' && got.messages.length) return { result: got, notice: listenNotice(got) };
    last = got;
    if (clock.now() >= deadline) break;
    // A call that came back at once must not turn into a tight loop.
    const elapsed = clock.now() - callStarted;
    if (elapsed < 1000) await clock.sleep(Math.min(1000 - elapsed, Math.max(0, deadline - clock.now())));
    if (clock.now() >= deadline) break;
  }

  // Out of time while the server was failing: say so, rather than report a quiet empty listen.
  if (failing) throw failing;
  const empty: NetworkListenResult = { rule: last?.rule ?? '', status: 'empty', messages: [], more: false,
    ...(last?.unread ? { unread: last.unread } : {}), ...(last?.hint ? { hint: last.hint } : {}) };
  return {
    result: { ...empty, waitedSeconds: Math.round((clock.now() - started) / 1000) },
    exitCode: EXIT_WAIT_TIMEOUT,
    notice: listenNotice(empty),
  };
}

export const runNetworkListen = (opts: NetworkListenOptions) =>
  runNetworkVerb('listen', async () => networkListen(await clientFor(await networkProfile(opts.profile)), opts));
