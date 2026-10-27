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
  webhook: { state: 'active' | 'disabled' | 'none' | 'unknown'; url?: string; reason?: string; consecutiveFailures?: number };
  /** A standing `network watch` (--print or --exec, not --drain) on this computer for this profile; null when it cannot be told. */
  watcher: { running: boolean | null; count: number };
  /** Something will hear a reply: true, or false when both ways were checked and neither is there; null when neither could be checked. */
  listening: boolean | null;
}

/** The command lines of every process, or null when this computer cannot list them. */
export type ProcessLister = () => Promise<string[] | null>;

export const listProcesses: ProcessLister = () => new Promise((resolve) => {
  if (process.platform === 'win32') return resolve(null);
  execFile('ps', ['-axo', 'command='], { timeout: 5000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
    resolve(err ? null : stdout.split('\n'));
  });
});

/** The profile a watch command line names with --profile, or undefined when it names none. */
function profileOf(line: string): string | undefined {
  const m = line.match(/--profile(?:=|\s+)(?:'([^']*)'|"([^"]*)"|(\S+))/);
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

/**
 * How many standing watches run for `profile`: a `network watch` with --print or --exec and no --drain. A watch that
 * names another profile is not counted; one that names none is (it uses the agent's own profile).
 */
export function countWatchers(lines: string[], profile?: string): number {
  let count = 0;
  for (const line of lines) {
    if (!/\bnetwork\s+watch\b/.test(line) || /\bps -axo\b/.test(line)) continue;
    if (!/--(print|exec)\b/.test(line) || /--drain\b/.test(line)) continue;
    const named = profileOf(line);
    if (named && profile && named !== profile) continue;
    count++;
  }
  return count;
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
      ? { state: 'active', url: w.url, consecutiveFailures: w.consecutiveFailures }
      : { state: 'disabled', url: w.url, ...(w.disabledReason ? { reason: w.disabledReason } : {}), consecutiveFailures: w.consecutiveFailures };
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
      ? 'Nothing is listening for you: you will not hear replies until you set one up (`{{accountSlug}} network doctor` says how).'
      : 'Could not tell whether a standing watch is running here; a webhook is not set.';
  return {
    listening: status.listening,
    webhook: status.webhook.state,
    watcher: status.watcher.running === null ? 'unknown' : status.watcher.running ? 'running' : 'not_running',
    note,
  };
}
