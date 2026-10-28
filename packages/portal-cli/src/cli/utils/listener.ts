/**
 * Whether this agent will hear a reply: a webhook that is active, or a standing watcher running on this computer.
 * `network doctor`, `whoami` and `send` all ask this one place. The server keeps no record of a poll that it reports
 * back to the poller, so a standing watch is found by looking for its process; where that cannot be done (no `ps`,
 * Windows) the answer is "unknown", never "not running".
 */

import { execFile } from 'node:child_process';
import type { PortalClient } from '../../index.js';
import { AgntApiError } from '../../HttpClient.js';

export interface ListenerStatus {
  webhook: { state: 'active' | 'disabled' | 'none' | 'unknown'; host?: string; reason?: string; consecutiveFailures?: number };
  /** A standing `network watch` (--print or --exec, not --drain) on this computer for this profile; null when it cannot be told. */
  watcher: { running: boolean | null; count: number };
  /** Something will hear a reply: true, or false when both ways were checked and neither is there; null when neither could be checked. */
  listening: boolean | null;
}

/**
 * A hint must never hold back the answer it rides on: the promise's value, or `fallback` if it has not settled in `ms`
 * (or fails). The timer never keeps the process alive.
 */
export function within<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    timer.unref();
    work.then((v) => { clearTimeout(timer); resolve(v); }, () => { clearTimeout(timer); resolve(fallback); });
  });
}

/** How long a hint may take before it is dropped. */
export const HINT_DEADLINE_MS = 2500;

/** The command lines of every process, or null when this computer cannot list them. */
export type ProcessLister = () => Promise<string[] | null>;

/** This user's own processes only (another user's watch is not ours), or null where `ps` or a user id is not there. */
export const listProcesses: ProcessLister = () => new Promise((resolve) => {
  if (process.platform === 'win32' || typeof process.getuid !== 'function') return resolve(null);
  execFile('ps', ['-u', String(process.getuid()), '-o', 'command='], { timeout: 2000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
    resolve(err ? null : stdout.split('\n'));
  });
});

/**
 * Whether a `ps` line is a standing watch for `profile`. `ps` shows the command's words without their quotes, so the
 * body of an `--exec` command cannot be told from our own flags: the words before `--exec` are read as flags, and after
 * it only a final `--drain` or a final `--profile <name>`. A watch that names no profile may belong to another agent on
 * this computer; it counts (the explicit profile of another agent does not).
 */
function standingWatchFor(line: string, profile?: string): boolean {
  const words = line.trim().split(/\s+/);
  const at = words.findIndex((w, i) => w === 'network' && words[i + 1] === 'watch');
  if (at < 0) return false;
  const args = words.slice(at + 2);
  const exec = args.indexOf('--exec');
  const own = exec < 0 ? args : args.slice(0, exec);
  const tail = exec < 0 ? [] : args.slice(exec + 1);
  const flags = [...own];
  if (tail.at(-1) === '--drain') flags.push('--drain');
  if (tail.length >= 2 && tail.at(-2) === '--profile') flags.push('--profile', tail.at(-1)!);
  const hasExec = exec >= 0 || flags.some((w) => w.startsWith('--exec='));
  if (!(hasExec || flags.includes('--print')) || flags.includes('--drain')) return false;
  const p = flags.findIndex((w) => w === '--profile' || w.startsWith('--profile='));
  const named = p < 0 ? undefined : flags[p].startsWith('--profile=') ? flags[p].slice(10) : flags[p + 1];
  return !(named && profile && named.replace(/^['"]|['"]$/g, '') !== profile);
}

/** How many standing watches run for `profile`: a `network watch` with --print or --exec and no --drain. */
export function countWatchers(lines: string[], profile?: string): number {
  return lines.filter((l) => !/^\s*ps\s/.test(l) && standingWatchFor(l, profile)).length;
}

/** Only the host of a webhook URL: its path or query may carry a token. */
function hostOf(url: unknown): string | undefined {
  try {
    return new URL(String(url)).host;
  } catch {
    return undefined;
  }
}

export async function listenerStatus(
  client: PortalClient,
  opts: { assistant?: string; profile?: string } = {},
  deps: { processes?: ProcessLister } = {},
): Promise<ListenerStatus> {
  let webhook: ListenerStatus['webhook'];
  try {
    const { webhook: w } = await client.network.getWebhook({ assistant: opts.assistant });
    webhook = w.status === 'active'
      ? { state: 'active', host: hostOf(w.url), consecutiveFailures: w.consecutiveFailures }
      : { state: 'disabled', host: hostOf(w.url), ...(w.disabledReason ? { reason: w.disabledReason } : {}), consecutiveFailures: w.consecutiveFailures };
  } catch (err) {
    // A 404 is the server saying there is none; anything else (down, an older server) is unknown.
    webhook = err instanceof AgntApiError && err.status === 404 ? { state: 'none' } : { state: 'unknown' };
  }
  const lines = await (deps.processes ?? listProcesses)().catch(() => null);
  const count = lines ? countWatchers(lines, opts.profile) : 0;
  const watcher = { running: lines ? count > 0 : null, count };
  const heard = webhook.state === 'active' || watcher.running === true;
  const checkedBoth = webhook.state !== 'unknown' && watcher.running !== null;
  return { webhook, watcher, listening: heard ? true : checkedBoth ? false : null };
}

/** The same thing, short, for whoami. */
export function reachabilityOf(status: ListenerStatus): Record<string, unknown> | undefined {
  if (status.listening === null && status.webhook.state === 'unknown') return undefined;
  const note = status.listening === true
    ? 'Something will hear a reply to what you send.'
    : status.listening === false
      ? 'Nothing is listening for you right now (no active webhook, no standing watch here): you will not hear replies until you set one up, or check by hand. `{{accountSlug}} network doctor` says how.'
      : 'Could not tell whether a standing watch is running here; a webhook is not set.';
  return {
    listening: status.listening,
    webhook: status.webhook.state,
    watcher: status.watcher.running === null ? 'unknown' : status.watcher.running ? 'running' : 'not_running',
    note,
  };
}
