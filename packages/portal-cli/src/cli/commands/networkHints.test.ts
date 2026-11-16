import { describe, it, expect, vi } from 'vitest';
import { sendNotes, notListeningNote, NO_LISTENER_NOTE, SCHEDULED_NOTE, WHEN_ASKED_NOTE, threadNote } from './networkHints.js';
import { reachabilityOf, HINT_DEADLINE_MS } from '../utils/listener.js';
import { AgntApiError } from '../../HttpClient.js';

const none = async () => [] as string[];
const watching = async () => ['node x network watch --print'];
const clientWith = (getWebhook: any) => ({ network: { getWebhook } }) as any;
const noHook = () => clientWith(vi.fn().mockRejectedValue(new AgntApiError(404, 'none', 'not_found')));
const hook = () => clientWith(vi.fn().mockResolvedValue({ webhook: { status: 'active', url: 'https://h.example.test/x', consecutiveFailures: 0 } }));
const sent = (recipients: any[]) => ({ id: 'i', receivedAt: 't', recipients }) as any;
// No recurring check said (`doctor --scheduled`), or one said for this profile.
const unsaid = async () => undefined;
const said = async (p?: string) => (p === 'claude-code' ? '2026-11-16T10:00:00.000Z' : undefined);

describe('send notes', () => {
  it('says you will not hear replies when nothing is listening, and names the ways to fix it', async () => {
    const notes = await sendNotes(noHook(), sent([{ to: 'a@agent.example.test', status: 'accepted' }]), {}, { processes: none, scheduledSince: unsaid });
    expect(notes).toEqual([NO_LISTENER_NOTE]);
    // The recurring check leads, as in the card and the doctor's fix, and doctor --scheduled is how it is recorded.
    expect(NO_LISTENER_NOTE).toMatch(/^Nothing is set up to hear a reply: no recurring check \(`\S+ network doctor --scheduled` records one\)/);
    expect(NO_LISTENER_NOTE).toMatch(/Ask your person how they want you to check, if you have not: the network recommends a recurring check every 15 minutes, never less often than hourly.*agent-guide --for .*then `\S+ network doctor --scheduled`/);
    expect(NO_LISTENER_NOTE).toMatch(/If they chose checks only when they ask, or you cannot schedule anything, tell them plainly and run `\S+ network doctor --when-asked`/);
  });

  it('says the person chose checks only when they ask, instead of asking for a listener', async () => {
    const notes = await sendNotes(noHook(), sent([{ to: 'a@agent.example.test', status: 'accepted' }]), {}, { processes: none, scheduledSince: unsaid, whenAskedSince: async () => '2026-11-16T10:00:00.000Z' });
    expect(notes).toEqual([WHEN_ASKED_NOTE]);
    expect(WHEN_ASKED_NOTE).toMatch(/^Your person chose that you check for messages only when they ask/);
  });

  it('agrees with doctor --scheduled: a recorded recurring check is never "no listener", and says to listen closely meanwhile', async () => {
    const notes = await sendNotes(noHook(), sent([{ to: 'a@agent.example.test', status: 'accepted' }]), { profile: 'claude-code' }, { processes: none, scheduledSince: said });
    expect(notes).toEqual([SCHEDULED_NOTE]);
    expect(SCHEDULED_NOTE).toMatch(/^Your recurring check will pick up a reply on its next run\. While this conversation is live, listen closely too: keep `\S+ network listen --timeout 300` running/);
    // Another profile's word is not this one's.
    expect(await sendNotes(noHook(), sent([]), { profile: 'codex' }, { processes: none, scheduledSince: said })).toEqual([NO_LISTENER_NOTE]);
    // With a webhook or a watch as well, nothing needs saying.
    expect(await sendNotes(hook(), sent([]), { profile: 'claude-code' }, { processes: none, scheduledSince: said })).toEqual([]);
    expect(await sendNotes(noHook(), sent([]), { profile: 'claude-code' }, { processes: watching, scheduledSince: said })).toEqual([]);
  });

  it('says nothing about listening when a webhook is active or a watch is running', async () => {
    expect(await sendNotes(hook(), sent([{ to: 'a@x.test', status: 'accepted' }]), {}, { processes: none, scheduledSince: unsaid })).toEqual([]);
    expect(await sendNotes(noHook(), sent([{ to: 'a@x.test', status: 'accepted' }]), {}, { processes: watching, scheduledSince: unsaid })).toEqual([]);
  });

  it('says nothing when it cannot tell (an older server, no process list)', async () => {
    const unknown = clientWith(vi.fn().mockRejectedValue(new AgntApiError(500, 'boom')));
    expect(await sendNotes(unknown, sent([{ to: 'a@x.test', status: 'accepted' }]), {}, { processes: none, scheduledSince: unsaid })).toEqual([]);
    expect(await sendNotes({} as any, sent([]), {}, { processes: none, scheduledSince: unsaid })).toEqual([]);
    expect(await sendNotes(noHook(), sent([]), {}, { processes: async () => null, scheduledSince: unsaid })).toEqual([]);
  });

  it('tells when the server says a recipient is not listening, with and without a webhook', async () => {
    const notes = await sendNotes(hook(), sent([
      { to: 'a@x.test', status: 'accepted', recipient: { listening: false, lastSeen: 'within_an_hour', webhook: false } },
      { to: 'b@x.test', status: 'accepted', recipient: { listening: false, lastSeen: 'never', webhook: true } },
      { to: 'c@x.test', status: 'accepted', recipient: { listening: true, lastSeen: 'within_a_minute', webhook: false } },
      { to: 'd@x.test', status: 'accepted' },
    ]), {}, { processes: none, scheduledSince: unsaid });
    expect(notes).toEqual([
      'a@x.test is not listening right now (last seen within the last hour) and has no webhook: it will see your message when it next checks, which may be a while.',
      'b@x.test is not listening right now (last seen never), but it has a webhook, so it should be told at once.',
    ]);
    expect(notListeningNote('z@x.test', { listening: false, lastSeen: 'odd' as any, webhook: false })).toMatch(/^z@x\.test is not listening right now and has no webhook/);
  });

  it('says which recipient was rejected as no such address', async () => {
    const notes = await sendNotes(hook(), sent([{ to: 'ghost@x.test', status: 'rejected', reason: 'no_such_address' }]), {}, { processes: none, scheduledSince: unsaid });
    expect(notes).toEqual(['ghost@x.test was not sent: no agent has that Network ID.']);
  });

  it('a looking recipient (an email or phone) is said not to be delivered yet, once, unless the server said so itself', async () => {
    const notes = await sendNotes(hook(), sent([{ to: 'dana@example.com', status: 'accepted', delivery: 'looking' }]), {}, { processes: none, scheduledSince: unsaid });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/^dana@example\.com is an email or phone, not a Network ID/);
    expect(notes[0]).toMatch(/If they have none, it is not delivered and nothing keeps it, even if they join later.*not delivered yet, only sent/);
    // The server's own hint says it (networkSend prints that once): the CLI's line is not added beside it.
    const said = await sendNotes(hook(), { ...sent([{ to: 'dana@example.com', status: 'accepted', delivery: 'looking' }]), hint: '  Held while we look.  ' }, {}, { processes: none, scheduledSince: unsaid });
    expect(said).toEqual([]);
  });
});

describe('whoami reachability', () => {
  it('is left out when neither way could be checked, and says plainly when nothing is listening', () => {
    expect(reachabilityOf({ webhook: { state: 'unknown' }, watcher: { running: null, count: 0 }, listening: null })).toBeUndefined();
    expect(reachabilityOf({ webhook: { state: 'none' }, watcher: { running: false, count: 0 }, listening: false })).toMatchObject({ listening: false, webhook: 'none', watcher: 'not_running' });
    expect(reachabilityOf({ webhook: { state: 'active' }, watcher: { running: null, count: 0 }, listening: true })).toMatchObject({ listening: true, watcher: 'unknown' });
  });
});

describe('thread hint', () => {
  const ID = 'a'.repeat(64);
  const NOW = Date.parse('2026-10-31T12:00:00Z');
  const list = (sends: any[]) => ({ network: { sentList: vi.fn().mockResolvedValue({ sends, cursor: null, more: false }) } }) as any;
  const sendTo = (to: string, sentAt: string, subject = 'PR 12') => ({ id: ID, sentAt, to: [to], content: { parts: [], inReplyTo: null, headers: { subject } } });

  it('names the recent thread and its id when you write to the same person again', async () => {
    const note = await threadNote(list([sendTo('bob@x.test', '2026-10-30T12:00:00Z')]), ['BOB@x.test'], {}, () => NOW);
    expect(note).toContain('bob@x.test');
    expect(note).toContain('thread "PR 12"');
    expect(note).toContain(`--in-reply-to ${ID}`);
  });

  it('asks for a short page, aborted at the hint deadline', async () => {
    const client = list([]);
    await threadNote(client, ['bob@x.test'], { assistant: 'a1' }, () => NOW);
    expect(client.network.sentList).toHaveBeenCalledWith({ limit: 10, assistant: 'a1', timeoutMs: HINT_DEADLINE_MS });
  });

  it('says nothing for someone new, an old thread, or when it cannot tell', async () => {
    expect(await threadNote(list([sendTo('bob@x.test', '2026-10-30T12:00:00Z')]), ['carol@x.test'], {}, () => NOW)).toBeUndefined();
    expect(await threadNote(list([sendTo('bob@x.test', '2026-10-01T12:00:00Z')]), ['bob@x.test'], {}, () => NOW)).toBeUndefined();
    expect(await threadNote({ network: { sentList: vi.fn().mockRejectedValue(new Error('x')) } } as any, ['bob@x.test'], {}, () => NOW)).toBeUndefined();
    expect(await threadNote({} as any, ['bob@x.test'])).toBeUndefined();
  });
});
