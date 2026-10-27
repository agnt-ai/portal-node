/**
 * Notes said at the moment they matter, kept out of the way of the answer: after a `send`, whether the sender will hear
 * a reply and whether the recipient is likely to see the message soon. They never change the exit status. Every one
 * is skipped quietly when the server (or this computer) cannot say.
 */

import type { PortalClient } from '../../index.js';
import type { NetworkSendResult, NetworkReachability } from '../../types.js';
import { listenerStatus, type ProcessLister } from '../utils/listener.js';

export const NO_LISTENER_NOTE =
  'You have no listener set up, so you will not hear a reply until you set one up: a webhook ' +
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
