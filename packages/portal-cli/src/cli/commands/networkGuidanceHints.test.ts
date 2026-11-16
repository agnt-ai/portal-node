import { describe, it, expect, vi } from 'vitest';
import { networkSent, networkSend } from './network.js';
import { joinedAnswer } from './networkJoin.js';
import { networkInbox } from './networkMailbox.js';

const ID = 'a'.repeat(64);

// 2026-11-16: `sent <id>` showed `accepted` with `server: null` for an email and said nothing, and `inbox` had no hint.
describe('the server\'s hints on sent and inbox', () => {
  it('sent <id> prints the delivery line and the server\'s hint for what it means', async () => {
    const hint = 'An email or phone always shows `accepted` with `server: null`, and that never changes: never call it delivered.';
    const client = { network: { sent: vi.fn().mockResolvedValue({ id: ID, servers: [{ server: null, recipients: ['sam@acme.example'], status: 'accepted' }], recipients: [{ to: 'sam@acme.example', status: 'accepted' }], hint }) } } as any;
    const out = await networkSent(client, ID, {});
    expect(out.notice).toBe(`delivery: sam@acme.example accepted\nnote: ${hint}`);
    expect((out.result as any).hint).toBe(hint);
  });

  it('sent <id> from an older server, with no hint, prints only the delivery line', async () => {
    const client = { network: { sent: vi.fn().mockResolvedValue({ id: ID, servers: [], recipients: [{ to: 'b@acme.test', status: 'delivered' }] }) } } as any;
    expect((await networkSent(client, ID, {})).notice).toBe('delivery: b@acme.test delivered');
  });

  it('inbox prints the server\'s hint, with who is waiting; an older server keeps the CLI\'s own line', async () => {
    const page = { rule: 'r', contract: 2, token: 't', more: false, messages: [], unread: { count: 2, senders: { 'a@acme.test': 2 } } };
    const withHint = { network: { inbox: vi.fn().mockResolvedValue({ ...page, hint: 'Reading the mailbox marks nothing read. 2 messages are unread: take them with listen (it marks them read).' }) } } as any;
    const a = await networkInbox(withHint, {});
    expect(a.notice).toBe('note: Reading the mailbox marks nothing read. 2 messages are unread: take them with listen (it marks them read). Unread: 2 unread from a@acme.test (2).');
    const older = { network: { inbox: vi.fn().mockResolvedValue(page) } } as any;
    expect((await networkInbox(older, {})).notice).toMatch(/^mailbox: 2 unread from a@acme\.test \(2\)\. Read them with/);
  });

  it('sent <id>\'s summary says what send\'s word means, never a bare accepted for an email (second cold agent)', async () => {
    const client = { network: { sent: vi.fn().mockResolvedValue({ id: ID, servers: [], recipients: [
      { to: 'sam@acme.example', status: 'accepted', delivery: 'looking' },
      { to: 'lee-agent@acme.test', status: 'delivered', delivery: 'sent' },
      { to: 'ghost@acme.test', status: 'rejected', reason: 'no_such_address', delivery: 'no_such_address' },
    ] }) } } as any;
    const line = (await networkSent(client, ID, {})).notice!.split('\n')[0];
    expect(line).toBe('delivery: sam@acme.example written to their email or phone (you cannot tell whether an agent has it), '
      + 'lee-agent@acme.test in their inbox (no read receipts: a reply is how you know it was read), ghost@acme.test rejected (no such address)');
  });

  it('send prints the server\'s hint once: in the answer as it came and on stderr, never copied into notes', async () => {
    const hint = 'One recipient was given as an email or phone (looking): never call it delivered.';
    const client = { network: {
      send: vi.fn().mockResolvedValue({ id: ID, receivedAt: 't', recipients: [{ to: 'sam@acme.example', status: 'accepted', delivery: 'looking' }], hint }),
      sentList: vi.fn().mockResolvedValue({ sends: [] }),
      getWebhook: vi.fn().mockResolvedValue({ webhook: { status: 'active', url: 'https://h.example.test/x', consecutiveFailures: 0 } }),
    } } as any;
    const out = await networkSend(client, { to: ['sam@acme.example'], subject: 'Lunch', text: 'Hi' }, { processes: async () => [], scheduledSince: async () => undefined }) as any;
    expect(out.result.hint).toBe(hint);
    expect(out.result.notes).toBeUndefined();
    expect(out.notice.split(hint)).toHaveLength(2);
    expect(JSON.stringify(out.result).split('never call it delivered')).toHaveLength(2);
  });

  it('join names the contact links connectContactsUrl, as the server\'s text and whoami do, and keeps connectContacts', () => {
    const urls = { google: 'https://g.example.test', microsoft: 'https://m.example.test', apple: 'https://a.example.test' };
    const a = joinedAnswer({ status: 'joined', address: 'dana-agent@acme.test', connectContactsUrl: urls });
    expect(a.connectContactsUrl).toEqual(urls);
    expect((a as any).connectContacts.urls).toEqual(urls);
    expect(Object.keys(joinedAnswer({ status: 'joined', address: 'dana-agent@acme.test' }))).not.toContain('connectContactsUrl');
  });
});
