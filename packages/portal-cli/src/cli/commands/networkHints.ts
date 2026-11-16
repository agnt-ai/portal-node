/**
 * Notes said at the moment they matter, kept out of the way of the answer: after a `send`, whether the sender will hear
 * a reply and whether the recipient is likely to see the message soon. They never change the exit status. Every one
 * is skipped quietly when the server (or this computer) cannot say.
 */

import type { PortalClient } from '../../index.js';
import type { NetworkSendResult, NetworkReachability } from '../../types.js';
import { listenerStatus, onlyScheduled, onlyWhenAsked, HINT_DEADLINE_MS, type ListenerDeps } from '../utils/listener.js';

/** Nothing will hear a reply: no recurring check said, no active webhook, no standing watch here. Leads with the check. */
export const NO_LISTENER_NOTE =
  'Nothing is set up to hear a reply: no recurring check (`{{accountSlug}} network doctor --scheduled` records one), no active webhook, no standing watch here. ' +
  'Ask your person how they want you to check, if you have not: the network recommends a recurring check every 15 minutes, never less often than hourly, running `{{accountSlug}} network listen` ' +
  '(`{{accountSlug}} agent-guide --for <claude-code|codex|server|chat-only>` has the way for your harness), then `{{accountSlug}} network doctor --scheduled`. ' +
  'If they chose checks only when they ask, or you cannot schedule anything, tell them plainly and run `{{accountSlug}} network doctor --when-asked`.';

/** The person chose checks only when they ask: a reply waits for that, so say so, once, plainly. */
export const WHEN_ASKED_NOTE =
  'Your person chose that you check for messages only when they ask: a reply waits until then, so tell them one may come. ' +
  'While this conversation is live and they want the answer, keep `{{accountSlug}} network listen --timeout 300` running and run it again each time it returns.';

/** Only the recurring check will hear a reply: say when, and to listen closely while the conversation is live. */
export const SCHEDULED_NOTE =
  'Your recurring check will pick up a reply on its next run. While this conversation is live, listen closely too: ' +
  'keep `{{accountSlug}} network listen --timeout 300` running and run it again each time it returns, or check every minute or two; ' +
  'when it goes quiet, the recurring check carries on.';

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
  deps: ListenerDeps = {},
): Promise<string[]> {
  const notes: string[] = [];
  try {
    const status = await listenerStatus(client, opts, deps);
    if (onlyWhenAsked(status)) notes.push(WHEN_ASKED_NOTE);
    else if (status.listening === false) notes.push(NO_LISTENER_NOTE);
    else if (onlyScheduled(status)) notes.push(SCHEDULED_NOTE);
  } catch {
    // Not knowing is not a reason to say anything.
  }
  // A newer server says what happened itself, in its `hint` (printed once, by networkSend): the CLI's own lines for the
  // same thing are not added.
  const said = typeof sent?.hint === 'string' && sent.hint.trim() ? sent.hint.trim() : undefined;
  for (const r of Array.isArray(sent?.recipients) ? sent.recipients : []) {
    if (r?.delivery === 'looking' && !said) {
      notes.push(lookingNote(r.to));
    } else if (r?.status === 'rejected') {
      notes.push(`${r.to} was not sent: ${r.reason === 'no_such_address' ? 'no agent has that Network ID' : 'the server rejected it'}.`);
    } else if (r?.recipient && r.recipient.listening === false) {
      notes.push(notListeningNote(r.to, r.recipient));
    }
  }
  return notes;
}

/**
 * An email or phone recipient: the network looks for the assistant its holder chose. With none it is not delivered
 * and nothing keeps it (agents only), and nothing will say so, by design (no answer may tell anyone whether a person
 * has an assistant).
 */
export const lookingNote = (to: string) =>
  `${to} is an email or phone, not a Network ID: the network is looking for the assistant its holder chose. ` +
  'If they have none, it is not delivered and nothing keeps it, even if they join later, and nothing will tell you ' +
  'either way. Tell your person it is not delivered yet, only sent, ' +
  'and report back if a reply comes. To reach an agent for sure, ask for its Network ID or find it with `{{accountSlug}} network discover`.';

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
