import { describe, it, expect, vi } from 'vitest';
import {
  inboxQuery, networkInbox, networkAck, networkThread, ackTarget, morePagesLine, idsToMarkRead, ACK_MAX_IDS, THREAD_MAX_PAGES,
} from './networkMailbox.js';
import { NetworkUsageError } from './network.js';
import { AgntApiError } from '../../HttpClient.js';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const SENDER = { verified: true, relation: 'external', pairing: null };
const entry = (id: string, extra: Record<string, unknown> = {}) => ({
  id, receivedAt: '2026-10-27T10:00:00.000Z', carrier: 'https://c.test', claims: [], sender: SENDER,
  kind: 'message', direction: 'received', unread: true, readAt: null,
  message: { untrusted: { from: 'bob@agent.test', basis: 'author-signed', content: { parts: [{ type: 'text/plain', data: 'hi' }] } } },
  ...extra,
});
const UNREAD = { count: 3, senders: { 'bob@agent.test': 2, network: 1 }, oldest: '2026-10-27T09:00:00.000Z' };
const mailboxPage = (extra: Record<string, unknown> = {}) => ({
  rule: 'r', contract: 2, view: 'received', order: 'unread_first', messages: [entry(A)], unread: UNREAD, matching: 1, more: false, cursor: null, token: 'tok', ...extra,
});
const legacyPage = { rule: 'r', token: 't', more: false, messages: [entry(A, { kind: undefined })], signals: [], marks: [], removed: [] };
const client = (network: Record<string, any>) => ({ network }) as any;

describe('inboxQuery', () => {
  it('always asks for a view: received by default, sent or all on request, all for a thread', () => {
    expect(inboxQuery({}).view).toBe('received');
    expect(inboxQuery({ sent: true }).view).toBe('sent');
    expect(inboxQuery({ all: true }).view).toBe('all');
    expect(inboxQuery({ thread: A.toUpperCase() })).toMatchObject({ view: 'all', order: 'oldest', thread: A });
  });

  it('passes the filters, order, limit and cursor, and keeps --since and --cursor as given', () => {
    expect(inboxQuery({ unread: true, from: ' bob@agent.test ', order: 'newest', limit: '20', cursor: ' c1 ', since: ' s ' })).toEqual({
      since: ' s ', cursor: ' c1 ', limit: 20, view: 'received', unread: true, from: 'bob@agent.test', thread: undefined, order: 'newest', assistant: undefined,
    });
  });

  it.each([
    [{ sent: true, all: true }, /not both/],
    [{ unread: true, sent: true }, /--unread is about messages you received: leave out --sent\.$/],
    [{ order: 'sideways' }, /--order is one of/],
    [{ thread: 'abc' }, /64 hex/],
    [{ thread: A, sent: true }, /both directions/],
    [{ thread: A, order: 'newest' }, /oldest first/],
    [{ from: '  ' }, /--from takes/],
    [{ cursor: '' }, /nonempty cursor/],
    [{ limit: '0' }, /1 to 200/],
    [{ after: '3' }, /no --after/],
  ])('refuses %j before anything is sent', (opts, message) => {
    expect(() => inboxQuery(opts as any)).toThrow(message);
  });
});

describe('network inbox as a mailbox', () => {
  it('sends the query and prints the page, with the unread line and no more-pages line when there is no more', async () => {
    const inbox = vi.fn().mockResolvedValue(mailboxPage());
    const out = await networkInbox(client({ inbox }), { unread: true, limit: '5' });
    expect(inbox).toHaveBeenCalledWith(expect.objectContaining({ view: 'received', unread: true, limit: 5 }));
    expect(out.result).toMatchObject({ contract: 2, unread: UNREAD });
    expect(out.notice).toMatch(/^mailbox: 3 unread from bob@agent\.test \(2\), network/);
    expect(out.notice).not.toMatch(/more pages/);
  });

  it('ALWAYS says on a plain line that there are more pages, and with which flag: the cursor, else the token', async () => {
    const more = mailboxPage({ more: true, cursor: 'cur 1', matching: 120, note: 'n' });
    const out = await networkInbox(client({ inbox: vi.fn().mockResolvedValue(more) }), {});
    expect(out.notice).toMatch(/^more pages \(120 match in all\), use --cursor "cur 1" \(with the same other options\)\. Do not treat this page as the whole inbox\./);
    expect(morePagesLine({ more: true, cursor: null, token: 'tok 2' })).toBe('more pages, use --since "tok 2". Do not treat this page as the whole inbox.');
    expect(morePagesLine({ more: true, cursor: null, token: null })).toMatch(/no token/);
    // On a mailbox page the token is the mailbox head, so --since would skip pages: never advised.
    expect(morePagesLine({ more: true, cursor: null, token: 'head', contract: 2 })).toMatch(/gave no cursor/);
    expect(morePagesLine({ more: true, cursor: null, token: 'head', contract: 2 })).not.toMatch(/--since/);
    expect(morePagesLine({ more: false, cursor: 'x' })).toBeUndefined();
    // A server without the mailbox pages by token.
    const legacy = await networkInbox(client({ inbox: vi.fn().mockResolvedValue({ ...legacyPage, more: true }) }), {});
    expect(legacy.notice).toMatch(/use --since "t"/);
  });

  it('does not tell you to run inbox --unread when you just did', async () => {
    const withFlag = await networkInbox(client({ inbox: vi.fn().mockResolvedValue(mailboxPage()) }), { unread: true });
    const without = await networkInbox(client({ inbox: vi.fn().mockResolvedValue(mailboxPage()) }), {});
    expect(withFlag.notice).not.toMatch(/Read them with/);
    expect(without.notice).toMatch(/Read them with .*inbox --unread/);
  });

  it('shows sent entries with each recipient, and a bounce as a bounce, in --brief too', async () => {
    const sent = entry(B, {
      direction: 'sent', unread: false, message: undefined,
      recipients: [{ to: 'ghost@agent.test', status: 'rejected', reason: 'no_such_address' }, { to: 'bob@agent.test', status: 'delivered' }],
    });
    const bounce = entry(C, { kind: 'bounce', message: undefined, sender: { system: true }, bounce: { sendId: B, to: 'ghost@agent.test', reason: 'no_such_address', detail: 'd' }, inReplyTo: B });
    const out = await networkInbox(client({ inbox: vi.fn().mockResolvedValue(mailboxPage({ view: 'all', messages: [sent, bounce] })) }), { all: true, brief: true });
    const [s, b] = (out.result as any).messages;
    expect(s).toMatchObject({ id: B, direction: 'sent', recipients: [{ to: 'ghost@agent.test', status: 'rejected' }, { to: 'bob@agent.test', status: 'delivered' }] });
    expect(b).toMatchObject({ id: C, kind: 'bounce', sender: { system: true }, bounce: { sendId: B, to: 'ghost@agent.test', reason: 'no_such_address' } });
    expect(b.untrusted.text).toEqual([]);
    // The server's free-text detail stays out of the brief; the full output has it.
    expect(b.bounce).not.toHaveProperty('detail');
    const full = await networkInbox(client({ inbox: vi.fn().mockResolvedValue(mailboxPage({ view: 'all', messages: [bounce] })) }), { all: true });
    expect((full.result as any).messages[0].bounce.detail).toBe('d');
  });

  describe('against a server without the mailbox', () => {
    it('a plain read still works: it shows the older stream as it comes', async () => {
      const inbox = vi.fn().mockResolvedValue(legacyPage);
      const out = await networkInbox(client({ inbox }), {});
      expect(out.result).toEqual(legacyPage);
      expect(out.notice).toBeUndefined();
    });

    it('a strict server that refuses the mailbox options as unknown keys gets the plain read once', async () => {
      const inbox = vi.fn().mockRejectedValueOnce(new AgntApiError(400, 'Unrecognized key', 'invalid')).mockResolvedValueOnce(legacyPage);
      const out = await networkInbox(client({ inbox }), { since: 's', limit: '7' });
      expect(out.result).toEqual(legacyPage);
      expect(inbox).toHaveBeenCalledTimes(2);
      expect(inbox.mock.calls[1][0]).toEqual({ since: 's', limit: 7, assistant: undefined });
    });

    it('a filter is refused, never answered with the unfiltered stream, whether the server ignores it or refuses it', async () => {
      for (const inbox of [vi.fn().mockResolvedValue(legacyPage), vi.fn().mockRejectedValue(new AgntApiError(400, 'Unrecognized key', 'invalid'))]) {
        for (const opts of [{ unread: true }, { from: 'bob@agent.test' }, { sent: true }, { all: true }, { order: 'oldest' }, { thread: A }]) {
          await expect(networkInbox(client({ inbox }), opts)).rejects.toMatchObject({ name: 'NotAvailableYetError', message: expect.stringMatching(/doesn't have the mailbox view yet/) });
        }
      }
    });

    it('a real refusal about a value is an error, not a reason to fall back', async () => {
      const bad = new AgntApiError(400, 'cursor is not valid', 'invalid');
      await expect(networkInbox(client({ inbox: vi.fn().mockRejectedValue(bad) }), { cursor: 'x' })).rejects.toBe(bad);
    });
  });

  describe('--mark-read', () => {
    it('acknowledges exactly the received, unread messages that were printed, and says what is still unread', async () => {
      const page = mailboxPage({
        view: 'all', messages: [entry(A), entry(B, { unread: false }), entry(C, { direction: 'sent', unread: false }), entry('d'.repeat(64), { kind: 'bounce' })],
      });
      const ack = vi.fn().mockResolvedValue({ acknowledged: 2, unread: { count: 1, senders: { 'bob@agent.test': 1 } } });
      const out = await networkInbox(client({ inbox: vi.fn().mockResolvedValue(page), ack }), { all: true, markRead: true });
      expect(ack).toHaveBeenCalledWith({ ids: [A, 'd'.repeat(64)] }, { assistant: undefined });
      expect(out.result).toMatchObject({ acknowledged: 2, unreadAfter: { count: 1 } });
      expect(out.notice).toMatch(/marked 2 read; still 1 unread from bob@agent\.test/);
    });

    it('does not call ack on a server without the mailbox, and says so', async () => {
      const ack = vi.fn();
      const out = await networkInbox(client({ inbox: vi.fn().mockResolvedValue(legacyPage), ack }), { markRead: true });
      expect(ack).not.toHaveBeenCalled();
      expect(out.notice).toMatch(/--mark-read did nothing: this server has no mailbox/);
    });

    it('does not call ack when nothing printed was unread', async () => {
      const ack = vi.fn();
      const page = mailboxPage({ messages: [entry(A, { unread: false })] });
      const out = await networkInbox(client({ inbox: vi.fn().mockResolvedValue(page), ack }), { markRead: true });
      expect(ack).not.toHaveBeenCalled();
      expect(out.notice).toMatch(/nothing on this page was unread/);
    });

    it('a failed ack still shows the page that was read, and reports the failure with its exit status', async () => {
      const ack = vi.fn().mockRejectedValue(new AgntApiError(503, 'down', 'network_unavailable'));
      const out = await networkInbox(client({ inbox: vi.fn().mockResolvedValue(mailboxPage()), ack }), { markRead: true });
      expect(out.result).toMatchObject({ messages: [{ id: A }], ackError: { code: 'network_unavailable', retryable: true } });
      expect(out.exitCode).toBe(75);
      expect(out.notice).toMatch(/--mark-read failed, nothing was marked/);
    });

    it('caps nothing itself: it acknowledges what one page printed (at most 200)', () => {
      const many = Array.from({ length: 200 }, (_, i) => entry(i.toString(16).padStart(64, '0')));
      expect(idsToMarkRead(many as any)).toHaveLength(200);
    });
  });
});

describe('network ack', () => {
  it('takes exactly one of ids, --thread, --from or --all', () => {
    expect(ackTarget([A, B.toUpperCase(), A], {})).toEqual({ ids: [A, B] });
    expect(ackTarget([], { thread: A })).toEqual({ thread: A });
    expect(ackTarget([], { from: ' bob@agent.test ' })).toEqual({ from: 'bob@agent.test' });
    expect(ackTarget([], { all: true })).toEqual({ all: true });
    for (const [ids, opts] of [[[], {}], [[A], { all: true }], [[], { thread: A, from: 'x@y.test' }]] as const) {
      expect(() => ackTarget([...ids], opts)).toThrow(/one way only/);
    }
    expect(() => ackTarget(['short'], {})).toThrow(/64 hex/);
    expect(() => ackTarget([], { thread: 'short' })).toThrow(/64 hex/);
    expect(() => ackTarget(Array.from({ length: ACK_MAX_IDS + 1 }, (_, i) => i.toString(16).padStart(64, '0')), {})).toThrow(/At most 200/);
    expect(() => ackTarget([], { from: '' })).toThrow(NetworkUsageError);
  });

  it('posts the target and says how many it marked and what is left', async () => {
    const ack = vi.fn().mockResolvedValue({ acknowledged: 4, unread: { count: 0, senders: {} } });
    const out = await networkAck(client({ ack }), [], { thread: A, assistant: 'as1' });
    expect(ack).toHaveBeenCalledWith({ thread: A }, { assistant: 'as1' });
    expect(out.result).toEqual({ acknowledged: 4, unread: { count: 0, senders: {} } });
    expect(out.notice).toBe('marked 4 read; nothing else is unread.');
  });

  it('an older server has no such route: said plainly as not available, not as a network that is off', async () => {
    const { describeError } = await import('./network.js');
    const gone = new AgntApiError(404, 'Route not found');
    const { body } = describeError('ack', gone);
    expect(body.code).toBe('not_available_yet');
    expect(body.hint).toMatch(/doesn't offer `network ack` yet/);
  });
});

describe('network thread', () => {
  const page = (messages: any[], more = false, cursor: string | null = null) => mailboxPage({ view: 'all', order: 'oldest', messages, more, cursor });

  it('asks for the whole conversation oldest first and follows the cursor to the end', async () => {
    const inbox = vi.fn().mockResolvedValueOnce(page([entry(A)], true, 'c1')).mockResolvedValueOnce(page([entry(B, { direction: 'sent' })]));
    const out = await networkThread(client({ inbox }), A.toUpperCase(), {});
    expect(inbox.mock.calls[0][0]).toEqual({ view: 'all', thread: A, order: 'oldest', limit: 200, cursor: undefined, assistant: undefined });
    expect(inbox.mock.calls[1][0]).toMatchObject({ cursor: 'c1' });
    expect((out.result as any).messages.map((m: any) => m.id)).toEqual([A, B]);
    expect((out.result as any).count).toBe(2);
    expect(out.notice).toBeUndefined();
  });

  it('says on a plain line when the thread is longer than it will follow', async () => {
    const inbox = vi.fn().mockResolvedValue(page([entry(A)], true, 'again'));
    const out = await networkThread(client({ inbox }), A, {});
    expect(inbox).toHaveBeenCalledTimes(THREAD_MAX_PAGES);
    expect(out.notice).toMatch(/more pages: this thread has more than 10 messages\. Do not treat this as the whole conversation/);
    expect(out.notice).toContain('--cursor "again"');
  });

  it('is not available without the mailbox, and refuses a short id', async () => {
    await expect(networkThread(client({ inbox: vi.fn().mockResolvedValue(legacyPage) }), A, {})).rejects.toMatchObject({ name: 'NotAvailableYetError' });
    await expect(networkThread(client({ inbox: vi.fn().mockRejectedValue(new AgntApiError(400, 'Unrecognized key', 'invalid')) }), A, {})).rejects.toMatchObject({ name: 'NotAvailableYetError' });
    await expect(networkThread(client({ inbox: vi.fn() }), 'abc', {})).rejects.toBeInstanceOf(NetworkUsageError);
  });
});
