import { describe, it, expect, vi } from 'vitest';
import { sendNotes, notListeningNote, NO_LISTENER_NOTE, threadNote } from './networkHints.js';
import { reachabilityOf } from '../utils/listener.js';
import { AgntApiError } from '../../HttpClient.js';

const none = async () => [] as string[];
const watching = async () => ['node x network watch --print'];
const clientWith = (getWebhook: any) => ({ network: { getWebhook } }) as any;
const noHook = () => clientWith(vi.fn().mockRejectedValue(new AgntApiError(404, 'none', 'not_found')));
const hook = () => clientWith(vi.fn().mockResolvedValue({ webhook: { status: 'active', url: 'https://h.example.test/x', consecutiveFailures: 0 } }));
const sent = (recipients: any[]) => ({ id: 'i', receivedAt: 't', recipients }) as any;

describe('send notes', () => {
  it('says you will not hear replies when nothing is listening, and names the ways to fix it', async () => {
    const notes = await sendNotes(noHook(), sent([{ to: 'a@agent.example.test', status: 'accepted' }]), {}, { processes: none });
    expect(notes).toEqual([NO_LISTENER_NOTE]);
    expect(NO_LISTENER_NOTE).toMatch(/you will not hear a reply until you set one up/);
    expect(NO_LISTENER_NOTE).toMatch(/network webhook set --url .*network watch --print.*agent-guide --for .*network doctor/);
  });

  it('says nothing about listening when a webhook is active or a watch is running', async () => {
    expect(await sendNotes(hook(), sent([{ to: 'a@x.test', status: 'accepted' }]), {}, { processes: none })).toEqual([]);
    expect(await sendNotes(noHook(), sent([{ to: 'a@x.test', status: 'accepted' }]), {}, { processes: watching })).toEqual([]);
  });

  it('says nothing when it cannot tell (an older server, no process list)', async () => {
    const unknown = clientWith(vi.fn().mockRejectedValue(new AgntApiError(500, 'boom')));
    expect(await sendNotes(unknown, sent([{ to: 'a@x.test', status: 'accepted' }]), {}, { processes: none })).toEqual([]);
    expect(await sendNotes({} as any, sent([]), {}, { processes: none })).toEqual([]);
    expect(await sendNotes(noHook(), sent([]), {}, { processes: async () => null })).toEqual([]);
  });

  it('tells when the server says a recipient is not listening, with and without a webhook', async () => {
    const notes = await sendNotes(hook(), sent([
      { to: 'a@x.test', status: 'accepted', recipient: { listening: false, lastSeen: 'within_an_hour', webhook: false } },
      { to: 'b@x.test', status: 'accepted', recipient: { listening: false, lastSeen: 'never', webhook: true } },
      { to: 'c@x.test', status: 'accepted', recipient: { listening: true, lastSeen: 'within_a_minute', webhook: false } },
      { to: 'd@x.test', status: 'accepted' },
    ]), {}, { processes: none });
    expect(notes).toEqual([
      'a@x.test is not listening right now (last seen within the last hour) and has no webhook: it will see your message when it next checks, which may be a while.',
      'b@x.test is not listening right now (last seen never), but it has a webhook, so it should be told at once.',
    ]);
    expect(notListeningNote('z@x.test', { listening: false, lastSeen: 'odd' as any, webhook: false })).toMatch(/^z@x\.test is not listening right now and has no webhook/);
  });

  it('says which recipient was rejected as no such address', async () => {
    const notes = await sendNotes(hook(), sent([{ to: 'ghost@x.test', status: 'rejected', reason: 'no_such_address' }]), {}, { processes: none });
    expect(notes).toEqual(['ghost@x.test was not sent: no agent has that Network ID.']);
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

  it('says nothing for someone new, an old thread, or when it cannot tell', async () => {
    expect(await threadNote(list([sendTo('bob@x.test', '2026-10-30T12:00:00Z')]), ['carol@x.test'], {}, () => NOW)).toBeUndefined();
    expect(await threadNote(list([sendTo('bob@x.test', '2026-10-01T12:00:00Z')]), ['bob@x.test'], {}, () => NOW)).toBeUndefined();
    expect(await threadNote({ network: { sentList: vi.fn().mockRejectedValue(new Error('x')) } } as any, ['bob@x.test'], {}, () => NOW)).toBeUndefined();
    expect(await threadNote({} as any, ['bob@x.test'])).toBeUndefined();
  });
});
