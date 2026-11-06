import { describe, it, expect, vi } from 'vitest';
import { networkListen, listenNotice, LISTEN_MAX_LIMIT } from './networkListen.js';
import { describeError, EXIT_WAIT_TIMEOUT, WAIT_CALL_SECONDS, NetworkUsageError, type WaitClock } from './network.js';
import { AgntApiError } from '../../HttpClient.js';

const fakeClient = (network: Record<string, unknown>) => ({ network }) as any;

/** A clock the test drives: sleeps advance time at once, and a listen mock advances it by how long the server held the call. */
function fakeClock(): WaitClock & { slept: number[]; advance(ms: number): void } {
  let t = 1_000_000;
  const slept: number[] = [];
  return { slept, now: () => t, sleep: async (ms) => { slept.push(ms); t += ms; }, advance: (ms) => { t += ms; } };
}

const msg = (id: string) => ({ id, kind: 'message', receivedAt: 'x', message: { untrusted: {} }, unread: false, direction: 'received' });
const batch = (n: number, more = false) => ({ rule: 'r', status: 'messages', messages: Array.from({ length: n }, (_, i) => msg(String(i))), unread: { count: more ? 4 : 0, senders: {}, oldest: null }, more });
const empty = { rule: 'r', status: 'empty', messages: [], unread: { count: 0, senders: {}, oldest: null }, more: false };

describe('network listen', () => {
  it('returns the first batch it is handed, exit 0, and asks the server with the options given', async () => {
    const listen = vi.fn().mockResolvedValue(batch(3));
    const out = await networkListen(fakeClient({ listen }), { limit: '10', from: 'bob@agent.example.net' }, fakeClock());
    expect(out.exitCode).toBeUndefined();
    expect(out.result).toMatchObject({ status: 'messages', more: false });
    expect((out.result as any).messages).toHaveLength(3);
    expect(listen).toHaveBeenCalledWith({ from: 'bob@agent.example.net', timeout: WAIT_CALL_SECONDS, limit: 10, assistant: undefined });
    expect(out.notice).toMatch(/These 3 messages are now read: nothing to acknowledge/);
  });

  it('keeps calling while the server answers empty, then exits 3 with an empty answer once --timeout is spent', async () => {
    const clock = fakeClock();
    const listen = vi.fn().mockImplementation(async ({ timeout }: { timeout: number }) => { clock.advance(timeout * 1000); return empty; });
    const out = await networkListen(fakeClient({ listen }), { timeout: '45' }, clock);
    expect(out.exitCode).toBe(EXIT_WAIT_TIMEOUT);
    expect(out.result).toMatchObject({ status: 'empty', messages: [], more: false, waitedSeconds: 45 });
    // Calls of at most WAIT_CALL_SECONDS, the last one shortened to what is left.
    expect(listen.mock.calls.map(([o]) => o.timeout)).toEqual([20, 20, 5]);
    expect(out.notice).toMatch(/This call already waited, so run listen again to keep waiting; never call it in a faster loop/);
  });

  it('never turns an empty answer that came back at once into a tight loop', async () => {
    const clock = fakeClock();
    const listen = vi.fn().mockResolvedValue(empty);
    await networkListen(fakeClient({ listen }), { timeout: '5' }, clock);
    expect(listen.mock.calls.length).toBeLessThanOrEqual(6);
    expect(clock.slept.every((ms) => ms > 0)).toBe(true);
  });

  it('waits 20 seconds in all by default, as the card says', async () => {
    const clock = fakeClock();
    const listen = vi.fn().mockImplementation(async ({ timeout }: { timeout: number }) => { clock.advance(timeout * 1000); return empty; });
    const out = await networkListen(fakeClient({ listen }), {}, clock);
    expect(listen.mock.calls.map(([o]) => o.timeout)).toEqual([20]);
    expect(out.result).toMatchObject({ waitedSeconds: 20 });
  });

  it('--timeout 0 asks once and says what is unread', async () => {
    const listen = vi.fn().mockResolvedValue(empty);
    const out = await networkListen(fakeClient({ listen }), { timeout: '0' }, fakeClock());
    expect(listen).toHaveBeenCalledTimes(1);
    expect(listen.mock.calls[0][0].timeout).toBe(0);
    expect(out.exitCode).toBe(EXIT_WAIT_TIMEOUT);
  });

  it('says to listen again at once when more is unread than the batch', async () => {
    const out = await networkListen(fakeClient({ listen: vi.fn().mockResolvedValue(batch(2, true)) }), {}, fakeClock());
    expect(out.notice).toMatch(/Handle these, then run listen again at once/);
  });

  it("prints the server's own hint when it gives one, and nothing of its own", () => {
    expect(listenNotice({ ...batch(1), hint: 'These 1 are now read.' } as any)).toBe('note: These 1 are now read.');
    expect(listenNotice({ ...empty, hint: 'Nothing unread.' } as any)).toBe('note: Nothing unread.');
  });

  it('backs off and keeps listening through a failure that may pass, then hands over the batch', async () => {
    const clock = fakeClock();
    const listen = vi.fn()
      .mockRejectedValueOnce(new AgntApiError(503, 'busy', 'network_unavailable', { retryAfter: 2 }))
      .mockResolvedValueOnce(batch(1));
    const out = await networkListen(fakeClient({ listen }), { timeout: '60' }, clock);
    expect((out.result as any).messages).toHaveLength(1);
    expect(clock.slept[0]).toBeGreaterThanOrEqual(1000);
  });

  it('a failure still failing at the deadline is reported, never a quiet empty listen', async () => {
    const clock = fakeClock();
    const listen = vi.fn().mockRejectedValue(new AgntApiError(503, 'busy', 'network_unavailable'));
    await expect(networkListen(fakeClient({ listen }), { timeout: '10' }, clock)).rejects.toBeInstanceOf(AgntApiError);
  });

  it('a server without listen is a plain not_available_yet: no retry and no fallback to wait', async () => {
    const wait = vi.fn();
    const listen = vi.fn().mockRejectedValue(new AgntApiError(404, 'Route not found', 'not_found'));
    const err = await networkListen(fakeClient({ listen, wait }), {}, fakeClock()).catch((e) => e);
    expect(listen).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
    const { body, exitCode } = describeError('listen', err);
    expect(exitCode).toBe(1);
    expect(body.retryable).toBe(false);
    expect(body.hint).toMatch(/doesn't offer `network listen` yet/);
  });

  it('refuses a --limit outside 1 to the server cap, and completes a bare --from with its own domain', async () => {
    await expect(networkListen(fakeClient({ listen: vi.fn() }), { limit: '0' }, fakeClock())).rejects.toBeInstanceOf(NetworkUsageError);
    await expect(networkListen(fakeClient({ listen: vi.fn() }), { limit: String(LISTEN_MAX_LIMIT + 1) }, fakeClock())).rejects.toBeInstanceOf(NetworkUsageError);
    const listen = vi.fn().mockResolvedValue(batch(1));
    const whoami = vi.fn().mockResolvedValue({ address: 'me@agent.example.net' });
    await networkListen(fakeClient({ listen, whoami }), { from: 'bob' }, fakeClock());
    expect(listen.mock.calls[0][0].from).toBe('bob@agent.example.net');
  });
});
