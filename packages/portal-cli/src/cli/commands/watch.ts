// @agnt-messaging-only: scripts/hydrate.mjs removes this file from other apps' builds.
/**
 * {{accountSlug}} agnt watch --exec "<command>" — keeps an agent available with no one at the keyboard: waits
 * for each new message and runs the command once for it, for example a headless agent (claude -p,
 * codex exec, an OpenClaw run) that reads the message and replies.
 *
 * Safety rules, by design:
 *   - The message never goes into the command line. The command string is the operator's own, run as is;
 *     the message reaches it only on stdin (the entry as JSON) and as a file whose path is in
 *     NETWORK_MESSAGE_FILE (mode 600, deleted afterwards). NETWORK_MESSAGE_ID is the server's hex id.
 *     Nothing another party wrote is ever interpolated, shell-expanded or passed as an argument.
 *   - One message at a time, each with a time limit (--exec-timeout). A command that fails, crashes or
 *     runs over is reported, and the loop goes on.
 *   - What the message says is untrusted input to whatever runs: the agent guide says so.
 *
 * Output is one JSON line per event on stdout. --drain handles every message already waiting, then exits
 * (for a scheduler such as cron); without it the watch runs until stopped (SIGINT or SIGTERM: the message in
 * hand is finished first).
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PortalClient } from '../../index.js';
import { AgntUsageError, describeError, plainError, withOwner, ownServerOf, type WaitClock } from './agnt.js';
import { clientFor } from '../utils/api.js';
import { agntProfile } from '../utils/agentIdentity.js';
import type { AgntWaitResult } from '../../types.js';

export interface WatchOptions {
  profile?: string;
  exec?: string;
  from?: string;
  execTimeout?: string;
  drain?: boolean;
}

export interface ExecResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  error?: string;
}

/** Runs the operator's command once for one message: the message only on stdin and in the file. */
export type Runner = (command: string, input: { json: string; id: string; profile?: string }, timeoutMs: number) => Promise<ExecResult>;

/**
 * The command's environment: this one's, but with the caller's own HOME when a wrapper gave this CLI another
 * (AGNT_CLI_CALLER_HOME), so a headless agent run here keeps its own settings and permission rules.
 */
function childEnv(): NodeJS.ProcessEnv {
  const { AGNT_CLI_CALLER_HOME: callerHome, ...env } = process.env;
  return callerHome ? { ...env, HOME: callerHome } : env;
}

function killGroup(pid: number | undefined, signal: NodeJS.Signals): void {
  if (pid === undefined) return;
  try {
    process.kill(-pid, signal);
  } catch {
    // Already gone.
  }
}

export const runCommand: Runner = (command, input, timeoutMs) => new Promise((resolve) => {
  const dir = mkdtempSync(join(tmpdir(), 'network-message-'));
  const file = join(dir, 'message.json');
  writeFileSync(file, input.json, { mode: 0o600 });
  const done = (r: ExecResult) => {
    rmSync(dir, { recursive: true, force: true });
    resolve(r);
  };
  // The command is the operator's own string, run by the shell as written. The message is not in it.
  // Its own process group, so a timeout stops everything the command started, not just the shell.
  const child = spawn('/bin/sh', ['-c', command], {
    detached: true,
    // The command answers as the agent whose message it handles, whatever agent it runs (AGNT_CLI_PROFILE wins).
    env: { ...childEnv(), NETWORK_MESSAGE_FILE: file, NETWORK_MESSAGE_ID: input.id, ...(input.profile ? { AGNT_CLI_PROFILE: input.profile } : {}) },
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    killGroup(child.pid, 'SIGTERM');
    setTimeout(() => killGroup(child.pid, 'SIGKILL'), 5000).unref();
  }, timeoutMs);
  child.on('error', (err) => { clearTimeout(timer); done({ exitCode: null, signal: null, timedOut, error: err.message }); });
  child.on('close', (code, signal) => { clearTimeout(timer); done({ exitCode: code, signal, timedOut }); });
  child.stdin.on('error', () => undefined); // a command that never reads stdin is fine
  child.stdin.end(input.json);
});

const realClock: WaitClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** One JSON line on stdout. */
const emitLine = (event: Record<string, unknown>) => process.stdout.write(`${JSON.stringify(event)}\n`);

function wholeSeconds(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!/^[0-9]+$/.test(value) || Number(value) < 1) throw new AgntUsageError(`--${name} takes a whole number of seconds, at least 1.`);
  return Number(value);
}

/**
 * The watch loop. `stopped()` ends it between messages. Returns the number of messages handled. A failure
 * that may pass (429, 503, no answer) backs off and keeps watching; any other failure ends the watch.
 */
export async function watchLoop(
  client: PortalClient,
  opts: WatchOptions,
  deps: { run?: Runner; clock?: WaitClock; stopped?: () => boolean; emit?: (e: Record<string, unknown>) => void; profile?: string } = {},
): Promise<number> {
  const command = opts.exec?.trim();
  if (!command) throw new AgntUsageError('Give --exec "<command>": what to run for each new message. The message reaches it on stdin and in the file at NETWORK_MESSAGE_FILE, never in the command line.');
  const timeoutMs = wholeSeconds('exec-timeout', opts.execTimeout, 600) * 1000;
  const run = deps.run ?? runCommand;
  const clock = deps.clock ?? realClock;
  const stopped = deps.stopped ?? (() => false);
  const emit = deps.emit ?? emitLine;
  let handled = 0;
  let backoff = 1;
  // Your own server, read once, when the first message comes.
  let own: string | undefined | null = null;

  emit({ event: 'watching', from: opts.from ?? null, drain: !!opts.drain });
  while (!stopped()) {
    let got: AgntWaitResult;
    const asked = clock.now();
    try {
      // Draining asks for what is already waiting; watching holds the server call open (it answers within ~22s).
      got = await client.agnt.wait({ from: opts.from, timeout: opts.drain ? 0 : 20 });
      backoff = 1;
    } catch (err) {
      const { body } = describeError('watch', err);
      if (!body.retryable) throw err;
      // A server's Retry-After is honoured up to 5 minutes, so a scheduler's --drain still ends.
      const pause = Math.min(Math.max(body.retryAfter ?? backoff, 1), 300);
      emit({ event: 'retrying', code: body.code, inSeconds: pause });
      await clock.sleep(pause * 1000);
      backoff = Math.min(backoff * 2, 30);
      continue;
    }
    if (got.status !== 'message') {
      if (opts.drain) break;
      // A server wait that comes back at once must not turn into a tight loop.
      const elapsed = clock.now() - asked;
      if (elapsed < 1000) await clock.sleep(1000 - elapsed);
      continue;
    }
    const started = clock.now();
    if (own === null) own = await ownServerOf(client);
    const result = await run(command, { json: JSON.stringify(withOwner(got, own)), id: got.id, profile: deps.profile }, timeoutMs);
    handled++;
    emit({
      event: 'handled', id: got.id, exitCode: result.exitCode, signal: result.signal,
      timedOut: result.timedOut, ...(result.error ? { error: result.error } : {}), seconds: Math.round((clock.now() - started) / 1000),
    });
  }
  emit({ event: 'stopped', handled });
  return handled;
}

/** The CLI entry point: the first SIGINT/SIGTERM stops after the message in hand, a second one at once. */
export async function runAgntWatch(opts: WatchOptions): Promise<void> {
  let stop = false;
  const onSignal = () => {
    if (stop) process.exit(130);
    stop = true;
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  try {
    const profile = await agntProfile(opts.profile);
    const client = await clientFor(profile);
    await watchLoop(client, opts, { stopped: () => stop, profile });
  } catch (err) {
    const { body, exitCode } = describeError('watch', err);
    process.stderr.write(`${plainError(body)}\n${JSON.stringify({ error: body }, null, 2)}\n`);
    process.exitCode = exitCode;
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
}
