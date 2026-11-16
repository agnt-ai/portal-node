import { describe, it, expect, vi } from 'vitest';
import { networkSent } from './network.js';
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
});
