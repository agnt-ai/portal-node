import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { watchLoop, runCommand, type Runner } from './watch.js';
import { AgntUsageError, type WaitClock } from './agnt.js';
import { AgntApiError } from '../../HttpClient.js';

const ID = 'c'.repeat(64);

function entry(text: string, id = ID) {
  return {
    status: 'message', rule: 'r', cursor: 1, id, receivedAt: 'x', carrier: 'https://agnt.example.test', more: false,
    message: { untrusted: { from: 'bob@agent.example.test', basis: 'author-signed', content: { parts: [{ type: 'text/plain', data: text }] } } },
    claims: [],
  };
}
const timeout = { status: 'timeout', waitedSeconds: 0, from: null };

function fakeClock(): WaitClock & { slept: number[] } {
  let t = 0;
  const slept: number[] = [];
  return { slept, now: () => t, sleep: async (ms) => { slept.push(ms); t += ms; } };
}

describe('agnt watch loop', () => {
  it('honours a server Retry-After only up to 5 minutes, so a drain still ends', async () => {
    const wait = vi.fn().mockRejectedValueOnce(new AgntApiError(503, 'busy', 'unavailable', { retryAfter: 3600 })).mockResolvedValue(timeout);
    const events: any[] = [];
    const clock = fakeClock();
    await watchLoop({ agnt: { wait } } as any, { exec: 'x', drain: true }, { run: vi.fn(), clock, emit: (e) => events.push(e) });
    expect(events.find((e) => e.event === 'retrying')).toMatchObject({ inSeconds: 300 });
    expect(clock.slept).toEqual([300_000]);
  });

  it('needs --exec', async () => {
    await expect(watchLoop({ agnt: { wait: vi.fn() } } as any, {}, { emit: () => undefined })).rejects.toBeInstanceOf(AgntUsageError);
  });

  it('runs the command once per message, one at a time, passing the message only as data', async () => {
    const wait = vi.fn().mockResolvedValueOnce(entry('one', 'a'.repeat(64))).mockResolvedValueOnce(entry('two', 'b'.repeat(64))).mockResolvedValue(timeout);
    const calls: Array<{ command: string; json: string; id: string }> = [];
    let running = 0;
    const run: Runner = async (command, input) => {
      running++;
      expect(running).toBe(1);
      calls.push({ command, ...input });
      running--;
      return { exitCode: 0, signal: null, timedOut: false };
    };
    const events: any[] = [];
    const handled = await watchLoop({ agnt: { wait } } as any, { exec: 'my-agent --reply', drain: true }, { run, clock: fakeClock(), emit: (e) => events.push(e) });
    expect(handled).toBe(2);
    expect(calls.map((c) => c.command)).toEqual(['my-agent --reply', 'my-agent --reply']);
    expect(JSON.parse(calls[0].json).message.untrusted.content.parts[0].data).toBe('one');
    expect(JSON.parse(calls[0].json).owner).toMatchObject({ actsFor: null, checkedBy: null, note: expect.any(String) });
    expect(calls[1].id).toBe('b'.repeat(64));
    expect(wait).toHaveBeenCalledWith({ from: undefined, timeout: 0 });
    expect(events.map((e) => e.event)).toEqual(['watching', 'handled', 'handled', 'stopped']);
  });

  it('a command that fails or runs over is reported, and the watch goes on', async () => {
    const wait = vi.fn().mockResolvedValueOnce(entry('one')).mockResolvedValueOnce(entry('two')).mockResolvedValue(timeout);
    const run = vi.fn()
      .mockResolvedValueOnce({ exitCode: null, signal: 'SIGTERM', timedOut: true })
      .mockResolvedValueOnce({ exitCode: 3, signal: null, timedOut: false });
    const events: any[] = [];
    const handled = await watchLoop({ agnt: { wait } } as any, { exec: 'x', drain: true }, { run, clock: fakeClock(), emit: (e) => events.push(e) });
    expect(handled).toBe(2);
    expect(events.filter((e) => e.event === 'handled')).toMatchObject([{ timedOut: true }, { exitCode: 3 }]);
  });

  it('backs off on a failure that may pass, and keeps watching', async () => {
    const wait = vi.fn()
      .mockRejectedValueOnce(new AgntApiError(503, 'down', 'agnt_unavailable'))
      .mockRejectedValueOnce(new AgntApiError(429, 'slow', 'rate_limited', { retryAfter: 9 }))
      .mockResolvedValueOnce(entry('one'))
      .mockResolvedValue(timeout);
    const clock = fakeClock();
    const handled = await watchLoop({ agnt: { wait } } as any, { exec: 'x', drain: true },
      { run: async () => ({ exitCode: 0, signal: null, timedOut: false }), clock, emit: () => undefined });
    expect(handled).toBe(1);
    expect(clock.slept).toEqual([1000, 9000]);
  });

  it('ends on a failure that will not pass', async () => {
    const wait = vi.fn().mockRejectedValue(new AgntApiError(401, 'revoked'));
    await expect(watchLoop({ agnt: { wait } } as any, { exec: 'x' }, { clock: fakeClock(), emit: () => undefined })).rejects.toThrow('revoked');
  });

  it('watching (not draining) holds server waits open, never spins, and stops between messages', async () => {
    let n = 0;
    const wait = vi.fn().mockImplementation(async () => { n++; return timeout; });
    const clock = fakeClock();
    await watchLoop({ agnt: { wait } } as any, { exec: 'x' }, { clock, stopped: () => n >= 3, emit: () => undefined });
    expect(wait).toHaveBeenCalledWith({ from: undefined, timeout: 20 });
    expect(clock.slept).toEqual([1000, 1000, 1000]);
  });

  it('refuses a bad --exec-timeout', async () => {
    await expect(watchLoop({ agnt: { wait: vi.fn() } } as any, { exec: 'x', execTimeout: '0' }, { emit: () => undefined })).rejects.toBeInstanceOf(AgntUsageError);
  });
});

describe('the command runner (a real shell)', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'watch-test-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('a message with $(...) and backticks is delivered as data and never executed', async () => {
    const hostile = `$(touch ${dir}/pwned-dollar) \`touch ${dir}/pwned-backtick\` "; touch ${dir}/pwned-quote; echo "`;
    const json = JSON.stringify(entry(hostile));
    const command = `cat > ${dir}/stdin.json; cp "$NETWORK_MESSAGE_FILE" ${dir}/file.json; printf '%s' "$NETWORK_MESSAGE_ID" > ${dir}/id; printf '%s\\n' "$@" > ${dir}/args`;
    const result = await runCommand(command, { json, id: ID }, 10_000);
    expect(result).toMatchObject({ exitCode: 0, timedOut: false });
    expect(existsSync(join(dir, 'pwned-dollar'))).toBe(false);
    expect(existsSync(join(dir, 'pwned-backtick'))).toBe(false);
    expect(existsSync(join(dir, 'pwned-quote'))).toBe(false);
    expect(readFileSync(join(dir, 'stdin.json'), 'utf8')).toBe(json);
    expect(readFileSync(join(dir, 'file.json'), 'utf8')).toBe(json);
    expect(readFileSync(join(dir, 'id'), 'utf8')).toBe(ID);
    expect(readFileSync(join(dir, 'args'), 'utf8')).toBe('\n'); // no arguments: the message is not on the command line
  });

  it('the command answers as the watching agent: AGNT_CLI_PROFILE is its profile', async () => {
    const result = await runCommand(`printf '%s' "$AGNT_CLI_PROFILE" > ${dir}/profile`, { json: '{}', id: ID, profile: 'claude-code' }, 10_000);
    expect(result.exitCode).toBe(0);
    expect(readFileSync(join(dir, 'profile'), 'utf8')).toBe('claude-code');
  });

  it('a command over its time limit is stopped with everything it started', async () => {
    const result = await runCommand(`sleep 30 & echo $! > ${dir}/bg; wait`, { json: '{}', id: ID }, 500);
    expect(result.timedOut).toBe(true);
    const bg = Number(readFileSync(join(dir, 'bg'), 'utf8'));
    await new Promise((r) => setTimeout(r, 200));
    expect(() => process.kill(bg, 0)).toThrow();
  });

  it('a command gets the caller\'s own HOME back when a wrapper gave this CLI another', async () => {
    vi.stubEnv('AGNT_CLI_CALLER_HOME', '/Users/someone');
    try {
      await runCommand(`printf '%s|%s' "$HOME" "$AGNT_CLI_CALLER_HOME" > ${dir}/home`, { json: '{}', id: ID }, 10_000);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(readFileSync(join(dir, 'home'), 'utf8')).toBe('/Users/someone|');
  });

  it('the message file exists only while the command runs', async () => {
    const result = await runCommand(`printf '%s' "$NETWORK_MESSAGE_FILE" > ${dir}/path`, { json: '{}', id: ID }, 10_000);
    expect(result.exitCode).toBe(0);
    const path = readFileSync(join(dir, 'path'), 'utf8');
    expect(path).toMatch(/message\.json$/);
    expect(existsSync(path)).toBe(false);
  });

  it('a command that runs over its time limit is stopped and reported', async () => {
    const started = Date.now();
    const result = await runCommand('sleep 30', { json: '{}', id: ID }, 300);
    expect(result.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('a failing command reports its exit code; one that never reads stdin is fine', async () => {
    expect((await runCommand('exit 3', { json: 'x'.repeat(200_000), id: ID }, 10_000)).exitCode).toBe(3);
  });

  it('the whole watch, with a hostile message, runs nothing from it', async () => {
    const hostile = `$(touch ${dir}/pwned) \`touch ${dir}/pwned2\``;
    const wait = vi.fn().mockResolvedValueOnce(entry(hostile)).mockResolvedValue(timeout);
    const handled = await watchLoop({ agnt: { wait } } as any, { exec: `cat > ${dir}/got.json`, drain: true }, { emit: () => undefined });
    expect(handled).toBe(1);
    expect(existsSync(join(dir, 'pwned'))).toBe(false);
    expect(existsSync(join(dir, 'pwned2'))).toBe(false);
    expect(JSON.parse(readFileSync(join(dir, 'got.json'), 'utf8')).message.untrusted.content.parts[0].data).toBe(hostile);
  });
});
