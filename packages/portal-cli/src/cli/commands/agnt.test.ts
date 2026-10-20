// @agnt-messaging-only: scripts/hydrate.mjs removes this file from other apps' builds.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  agntWait, agntInbox, agntSent, sendBodyFrom, readVerifyInput, oneMessage, describeError, runAgntVerb,
  AgntUsageError, EXIT_RETRY, EXIT_USAGE, EXIT_WAIT_TIMEOUT, WAIT_CALL_SECONDS, type WaitClock,
} from './agnt.js';
import { AgntApiError } from '../../HttpClient.js';
import { NotJoinedError } from '../utils/agentIdentity.js';

const ID = 'b'.repeat(64);

function fakeClient(agnt: Record<string, any>) {
  return { agnt } as any;
}

/** A clock the test drives: sleeps advance time at once. */
function fakeClock(): WaitClock & { slept: number[]; advance(ms: number): void } {
  let t = 1_000_000;
  const slept: number[] = [];
  return {
    slept,
    now: () => t,
    sleep: async (ms) => { slept.push(ms); t += ms; },
    // A wait mock advances time by however long the server held the call.
    advance: (ms) => { t += ms; },
  };
}

const message = { status: 'message', rule: 'r', cursor: 1, id: ID, receivedAt: 'x', carrier: 'https://a', message: { untrusted: {} }, claims: [], more: false };

describe('agnt wait', () => {
  it('returns the first message the server shows', async () => {
    const wait = vi.fn().mockResolvedValue(message);
    const out = await agntWait(fakeClient({ wait }), { from: 'bob@agnt.example.net' }, fakeClock());
    expect(out).toEqual({ result: message });
    expect(wait).toHaveBeenCalledWith({ from: 'bob@agnt.example.net', timeout: WAIT_CALL_SECONDS, assistant: undefined });
  });

  it('loops server timeouts until --timeout, then exits 3 with the timeout shape', async () => {
    const clock = fakeClock();
    const wait = vi.fn().mockImplementation(async ({ timeout }) => {
      clock.advance(timeout * 1000);
      return { status: 'timeout', waitedSeconds: timeout, from: null };
    });
    const out = await agntWait(fakeClient({ wait }), { timeout: '50' }, clock);
    expect(wait.mock.calls.map((c) => c[0].timeout)).toEqual([20, 20, 10]);
    expect(out).toEqual({ result: { status: 'timeout', waitedSeconds: 50, from: null }, exitCode: EXIT_WAIT_TIMEOUT });
  });

  it('--timeout 0 polls exactly once', async () => {
    const clock = fakeClock();
    const wait = vi.fn().mockResolvedValue({ status: 'timeout', waitedSeconds: 0, from: null });
    const out = await agntWait(fakeClient({ wait }), { timeout: '0' }, clock);
    expect(wait).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenCalledWith({ from: undefined, timeout: 0, assistant: undefined });
    expect(out).toEqual({ result: { status: 'timeout', waitedSeconds: 0, from: null }, exitCode: EXIT_WAIT_TIMEOUT });
  });

  it('never spins: a server timeout that comes back at once is followed by a pause', async () => {
    const clock = fakeClock();
    const wait = vi.fn().mockResolvedValue({ status: 'timeout', waitedSeconds: 0, from: null });
    await agntWait(fakeClient({ wait }), { timeout: '3' }, clock);
    expect(wait.mock.calls.length).toBeLessThanOrEqual(4);
    expect(clock.slept.every((ms) => ms >= 0)).toBe(true);
    expect(clock.slept.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(2000);
  });

  it('backs off on a 429 by its Retry-After, then keeps waiting', async () => {
    const clock = fakeClock();
    const wait = vi.fn()
      .mockRejectedValueOnce(new AgntApiError(429, 'slow down', 'rate_limited', { retryAfter: 7 }))
      .mockResolvedValueOnce(message);
    const out = await agntWait(fakeClient({ wait }), {}, clock);
    expect(clock.slept).toEqual([7000]);
    expect(out.result).toEqual(message);
  });

  it('backs off on a 503 with doubling pauses', async () => {
    const clock = fakeClock();
    const down = () => new AgntApiError(503, 'down', 'agnt_unavailable');
    const wait = vi.fn().mockRejectedValueOnce(down()).mockRejectedValueOnce(down()).mockResolvedValueOnce(message);
    await agntWait(fakeClient({ wait }), {}, clock);
    expect(clock.slept).toEqual([1000, 2000]);
  });

  it('ends at once on an error that will not pass', async () => {
    const wait = vi.fn().mockRejectedValue(new AgntApiError(403, 'no', 'pair_bound_key'));
    await expect(agntWait(fakeClient({ wait }), {}, fakeClock())).rejects.toThrow('no');
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it('refuses a --timeout that is not a whole number', async () => {
    await expect(agntWait(fakeClient({ wait: vi.fn() }), { timeout: 'soon' }, fakeClock())).rejects.toBeInstanceOf(AgntUsageError);
  });
});

describe('agnt send body', () => {
  it('splits comma-separated --to and keeps the order given', () => {
    const body = sendBodyFrom({ to: ['bob@agnt.example.net,carol@example.com', '+14155550100'], text: 'hi' });
    expect(body).toEqual({ to: ['bob@agnt.example.net', 'carol@example.com', '+14155550100'], text: 'hi' });
  });

  it('reads --text - from stdin', () => {
    expect(sendBodyFrom({ to: ['a@b.c'], text: '-' }, () => 'from stdin').text).toBe('from stdin');
  });

  it('turns --header name=value into headers, keeping = in the value', () => {
    const body = sendBodyFrom({ to: ['a@b.c'], text: 'x', header: ['subject=a=b', 'x-thread=1'] });
    expect(body.headers).toEqual({ subject: 'a=b', 'x-thread': '1' });
  });

  it('refuses for and pairing headers, bad header names, a bad --in-reply-to, and no --to or --text', () => {
    expect(() => sendBodyFrom({ to: ['a@b.c'], text: 'x', header: ['for=me'] })).toThrow(AgntUsageError);
    expect(() => sendBodyFrom({ to: ['a@b.c'], text: 'x', header: ['Subject=x'] })).toThrow(AgntUsageError);
    expect(() => sendBodyFrom({ to: ['a@b.c'], text: 'x', inReplyTo: 'nope' })).toThrow(AgntUsageError);
    expect(() => sendBodyFrom({ to: [], text: 'x' })).toThrow(AgntUsageError);
    expect(() => sendBodyFrom({ to: ['a@b.c'] })).toThrow(AgntUsageError);
  });

  it('accepts a 12+ hex prefix for --in-reply-to (resolved before sending), and refuses shorter ones plainly', () => {
    expect(sendBodyFrom({ to: ['a@b.c'], text: 'x', inReplyTo: 'ABCDEF123456' }).inReplyTo).toBe('abcdef123456');
    expect(() => sendBodyFrom({ to: ['a@b.c'], text: 'x', inReplyTo: 'abcdef12' })).toThrow(/in full \(64 hex characters\), or a unique prefix of 12 or more/);
  });

  it('passes --in-reply-to and --assistant through', () => {
    const body = sendBodyFrom({ to: ['a@b.c'], text: 'x', inReplyTo: ID, assistant: 'as1' });
    expect(body).toMatchObject({ inReplyTo: ID, assistant: 'as1' });
  });
});

describe('agnt inbox and sent', () => {
  it('inbox parses --after and --limit as whole numbers', async () => {
    const inbox = vi.fn().mockResolvedValue({ rule: 'r', cursor: 41, more: false, messages: [] });
    await agntInbox(fakeClient({ inbox }), { after: '41', limit: '10' });
    expect(inbox).toHaveBeenCalledWith({ after: 41, limit: 10, assistant: undefined });
    await expect(agntInbox(fakeClient({ inbox }), { limit: '500' })).rejects.toBeInstanceOf(AgntUsageError);
  });

  it('sent shows an email or phone recipient exactly as the server reports it: accepted, server null', async () => {
    const report = { id: ID, servers: [
      { server: 'https://agnt.example.net', recipients: ['bob@agnt.example.net'], status: 'delivered' },
      { server: null, recipients: ['carol@example.com', '+14155550100'], status: 'accepted' },
    ] };
    const sent = vi.fn().mockResolvedValue(report);
    expect(await agntSent(fakeClient({ sent }), ID, {})).toEqual({ result: report });
  });

  it('sent refuses an id that is not a message id before calling', async () => {
    const sent = vi.fn();
    await expect(agntSent(fakeClient({ sent }), 'xyz', {})).rejects.toBeInstanceOf(AgntUsageError);
    expect(sent).not.toHaveBeenCalled();
  });
});

describe('agnt verify input', () => {
  it('reads JSON from a file or from stdin', () => {
    expect(readVerifyInput('entry.json', () => '{"id":"x"}')).toEqual({ id: 'x' });
    expect(readVerifyInput('-', (f) => (f === 0 ? '{"id":"y"}' : ''))).toEqual({ id: 'y' });
  });

  it("takes wait's output as is, an inbox entry, or a page holding one message", () => {
    const entry = { cursor: 1, id: ID, receivedAt: 'x', carrier: 'https://a', message: { untrusted: {} }, claims: [] };
    expect(oneMessage({ status: 'message', rule: 'r', more: false, ...entry })).toEqual(entry);
    expect(oneMessage(entry)).toEqual(entry);
    expect(oneMessage({ rule: 'r', cursor: 1, more: false, messages: [entry] })).toEqual(entry);
    expect(() => oneMessage({ rule: 'r', cursor: 2, more: false, messages: [entry, entry] })).toThrow(/inbox page with 2 messages: give one/);
    expect(() => oneMessage({ status: 'timeout', waitedSeconds: 5, from: null })).toThrow(/timed out: there is no message/);
  });

  it('refuses input that is not JSON as a usage error', () => {
    expect(() => readVerifyInput('-', () => 'not json')).toThrow(AgntUsageError);
  });
});

describe('agnt errors', () => {
  it('a 404 not_found on sent says the id has no record, exit 1', () => {
    const { body, exitCode } = describeError('sent', new AgntApiError(404, 'Not found', 'not_found'));
    expect(exitCode).toBe(1);
    expect(body).toMatchObject({ code: 'not_found', status: 404, retryable: false });
    expect(body.hint).toMatch(/no message with that id/i);
  });

  it('a 503 verify_unavailable is retryable, exit 75', () => {
    const { body, exitCode } = describeError('verify', new AgntApiError(503, 'unavailable', 'verify_unavailable'));
    expect(exitCode).toBe(EXIT_RETRY);
    expect(body).toMatchObject({ code: 'verify_unavailable', retryable: true });
  });

  it('a 429 carries retryAfter and says not to loop', () => {
    const { body, exitCode } = describeError('send', new AgntApiError(429, 'slow', 'rate_limited', { retryAfter: 30 }));
    expect(exitCode).toBe(EXIT_RETRY);
    expect(body.retryAfter).toBe(30);
    expect(body.hint).toMatch(/do not retry in a loop/i);
  });

  it('a 400 invalid keeps its details, exit 1', () => {
    const { body, exitCode } = describeError('send', new AgntApiError(400, 'bad', 'invalid', { details: { field: 'to[0]' } }));
    expect(exitCode).toBe(1);
    expect(body.details).toEqual({ field: 'to[0]' });
  });

  it('a usage error is exit 2 with status null', () => {
    const { body, exitCode } = describeError('send', new AgntUsageError('Give --to'));
    expect(exitCode).toBe(EXIT_USAGE);
    expect(body).toMatchObject({ code: 'invalid', status: null });
  });

  it('a detected agent that has not joined: not_joined, exit 1, told to join', () => {
    const { body, exitCode } = describeError('whoami', new NotJoinedError('codex'));
    expect(exitCode).toBe(1);
    expect(body).toMatchObject({ code: 'not_joined', status: null, retryable: false });
    expect(body.message).toMatch(/agnt join --email/);
  });

  it('no answer at all is retryable network_error', () => {
    const { body, exitCode } = describeError('inbox', new TypeError('fetch failed'));
    expect(exitCode).toBe(EXIT_RETRY);
    expect(body.code).toBe('network_error');
  });
});

describe('runAgntVerb', () => {
  let out: string[];
  let err: string[];
  beforeEach(() => {
    out = []; err = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((s: string) => { out.push(s); return true; }) as any);
    vi.spyOn(process.stderr, 'write').mockImplementation(((s: string) => { err.push(s); return true; }) as any);
    process.exitCode = undefined;
  });
  afterEach(() => { vi.restoreAllMocks(); process.exitCode = undefined; });

  it('prints the result as JSON on stdout', async () => {
    await runAgntVerb('whoami', async () => ({ result: { address: 'sally@agent.example' } }));
    expect(JSON.parse(out.join(''))).toEqual({ address: 'sally@agent.example' });
    expect(process.exitCode).toBeUndefined();
  });

  it('prints an error as JSON on stderr and sets the exit status', async () => {
    await runAgntVerb('send', async () => { throw new AgntApiError(429, 'slow', 'rate_limited', { retryAfter: 5 }); });
    const text = err.join('');
    expect(text.split('\n')[0]).toMatch(/^error: slow /);
    expect(JSON.parse(text.slice(text.indexOf('\n') + 1)).error).toMatchObject({ code: 'rate_limited', retryAfter: 5, retryable: true });
    expect(process.exitCode).toBe(EXIT_RETRY);
    expect(out).toEqual([]);
  });

  it('a 400 with a field prints it on the plain line too', async () => {
    await runAgntVerb('send', async () => { throw new AgntApiError(400, 'a message id is 64 lower-case hex digits', 'invalid', { details: { field: 'inReplyTo' } }); });
    expect(err.join('').split('\n')[0]).toBe('error: a message id is 64 lower-case hex digits (field: inReplyTo) The server refused part of the request; details.field names it.');
  });

  it('a wait timeout prints its shape and exits 3', async () => {
    await runAgntVerb('wait', async () => ({ result: { status: 'timeout' }, exitCode: EXIT_WAIT_TIMEOUT }));
    expect(JSON.parse(out.join(''))).toEqual({ status: 'timeout' });
    expect(process.exitCode).toBe(EXIT_WAIT_TIMEOUT);
  });
});
