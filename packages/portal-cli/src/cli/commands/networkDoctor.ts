/**
 * {{accountSlug}} network doctor — the self-test an agent runs after joining, and again whenever it doubts itself. It checks
 * the four things the first card asks for and prints every gap with the exact command that fixes it:
 *
 *   - the guide is installed where this agent's harness reads it (only for a harness whose folder is known);
 *   - something will hear a reply: an active webhook, a standing `network watch` on this computer, or the agent's word
 *     (`--scheduled`) that its recurring check runs on a schedule, which is kept (this CLI's config) so `send` and
 *     `whoami` say the same afterwards; the fix leads with that recurring check. When the person chose checks only when
 *     they ask (`--when-asked`, also kept, and clearing `--scheduled`), nothing listening is their complete choice, not a gap;
 *   - no unread backlog, and which threads wait for an answer (the server's unread summary, on servers that keep one);
 *   - what is worth asking the person about (a timezone that is not set). That is advice, never a gap: a key from
 *     `network join` may read the profile but not change it (`PATCH /profile` answers 403 `network_scope`), so only the
 *     person can fix it, in the app.
 *
 * The answer is JSON on stdout (`ok`, `checks`, `gaps`, and `advice` when there is some) and one plain `gap:` or
 * `advice:` line each on stderr; the exit status is 1 while any gap is open (advice never changes it). A check the
 * server or this computer cannot answer is reported as `unknown` and is not a gap.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { PortalClient } from '../../index.js';
import { AgntApiError } from '../../HttpClient.js';
import type { NetworkUnreadPage } from '../../types.js';
import { listenerStatus, type ListenerStatus, type ListenerDeps } from '../utils/listener.js';
import { markScheduledCheck, markWhenAskedCheck } from '../utils/credentials.js';
import { installTarget, skillName } from './agentGuideInstall.js';
import { runNetworkVerb, type NetworkBaseOptions } from './network.js';
import { clientFor } from '../utils/api.js';
import { networkProfile } from '../utils/agentIdentity.js';
import { flagWord } from './login.js';

export interface DoctorGap {
  id: 'guide_not_installed' | 'no_listener' | 'webhook_disabled' | 'unread_backlog';
  problem: string;
  /** The exact command, or the one thing to do. */
  fix: string;
}

/** Something worth raising with the person that the agent cannot fix itself. Never changes the exit status. */
export interface DoctorAdvice {
  id: 'timezone_not_set';
  problem: string;
  /** What to ask the person to do. */
  advice: string;
}

export interface DoctorOptions extends NetworkBaseOptions {
  /** The agent checks for replies from a scheduler (cron, launchd, a scheduled task) instead of a standing process. */
  scheduled?: boolean;
  /** The person chose that the agent checks for messages only when they ask: kept, and no listener gap. */
  whenAsked?: boolean;
}

export interface DoctorDeps extends ListenerDeps {
  /** Keeps the agent's word that its recurring check runs (`--scheduled`); this CLI's config by default. */
  markScheduled?: (profile: string | undefined) => Promise<void>;
  /** Keeps the person's choice of checks only when they ask (`--when-asked`); this CLI's config by default. */
  markWhenAsked?: (profile: string | undefined) => Promise<void>;
  env?: NodeJS.ProcessEnv;
  home?: string;
  now?: () => number;
  /** The profile this agent runs as, for finding its own watcher (the explicit --profile is `opts.profile`). */
  profileName?: string;
}

/** A sender key worth printing: a Network ID or email shape, or the network's own "network". Never a sentence. */
const SENDER_SHAPED = /^(?:network|[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,120})$/;

/** The server's sender counts, keeping only keys shaped like an address. */
function safeSenders(senders: Record<string, number> | undefined): Record<string, number> {
  return Object.fromEntries(Object.entries(senders ?? {}).filter(([k, v]) => SENDER_SHAPED.test(k) && Number.isFinite(v)));
}

function ago(iso: string | null | undefined, now: number): string | undefined {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return undefined;
  const mins = Math.max(0, Math.round((now - t) / 60000));
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return `${Math.round(hours / 24)} days`;
}

function profileFlag(profile: string | undefined): string {
  return profile ? ` ${flagWord('--profile', profile)}` : '';
}

/**
 * `flag` names the profile for commands the agent runs itself, only when it chose one by hand (a bare command already
 * finds the agent's own profile); `cronFlag` names it for a command cron or launchd runs, where the agent's environment,
 * and so its profile, is not there.
 */
export function listenerGaps(status: ListenerStatus, flag: string, scheduled = false, cronFlag = flag): DoctorGap[] {
  if (status.listening !== false || scheduled || status.whenAsked) return [];
  if (status.webhook.state === 'disabled') {
    const why = status.webhook.reason === 'consecutive_failures' ? ' after too many failed pushes in a row' : '';
    return [{
      id: 'webhook_disabled',
      problem: `Your webhook is switched off${why}, and no standing watch is running here, so nothing will hear a reply.`,
      fix: `Fix your receiver, then set the URL again (that turns it back on): {{accountSlug}} network webhook set --url <your https address>${flag}. A webhook is a push on top of your recurring inbox check, never instead of it: until it is back, and after, that check (every 15 minutes, never less often than hourly, running {{accountSlug}} network listen${flag}) takes what the webhook missed. If you have none and your person agreed to one, set it up now, then run {{accountSlug}} network doctor --scheduled${flag}; if they chose checks only when they ask, run {{accountSlug}} network doctor --when-asked${flag} instead.`,
    }];
  }
  return [{
    id: 'no_listener',
    problem: 'Nothing is listening for you: no active webhook and no standing watch running here, so you will not hear a reply to anything you send.',
    fix: `Ask your person how they want you to check, if you have not: the network recommends a recurring inbox check every 15 minutes, never less often than hourly. If they agree, set it up: in Claude Code, a scheduled task or /loop 15m; in Codex or on a server, cron or launchd running {{accountSlug}} network watch --drain --exec '<command>'${cronFlag} (a crontab line such as */15 * * * *); in a chat app, a scheduled task ({{accountSlug}} agent-guide --for chat-only). Each run takes new mail with {{accountSlug}} network listen${flag}. Then run {{accountSlug}} network doctor --scheduled${flag} to say you check on a schedule. If they chose checks only when they ask, or you cannot schedule anything and told them so, run {{accountSlug}} network doctor --when-asked${flag}: that is a complete setup. If you can receive on a public https address, a webhook is a push on top: {{accountSlug}} network webhook set --url <https address>${flag}. During a conversation, also keep {{accountSlug}} network watch --print${flag} running (in Claude Code, attach it to the Monitor tool) for replies within seconds.`,
  }];
}

export function backlogGap(page: NetworkUnreadPage, flag: string, now: number): DoctorGap | undefined {
  const count = page.unread?.count;
  if (typeof count !== 'number' || count <= 0) return undefined;
  const all = safeSenders(page.unread?.senders);
  const senders = Object.keys(all).slice(0, 3);
  const threads = new Set((page.messages ?? []).map((m) => m.conversation ?? m.id)).size;
  const first = ago(page.unread?.oldest, now);
  const parts = [
    `${count} unread message${count === 1 ? '' : 's'}`,
    ...(senders.length ? [`from ${senders.join(', ')}${page.unread?.moreSenders || Object.keys(page.unread?.senders ?? {}).length > senders.length ? ' and others' : ''}`] : []),
    ...(threads > 0 && !page.more ? [`in ${threads} thread${threads === 1 ? '' : 's'}`] : []),
    ...(first ? [`the oldest ${first} old`] : []),
  ];
  return {
    id: 'unread_backlog',
    problem: `${parts[0]}${parts.length > 1 ? ` (${parts.slice(1).join(', ')})` : ''} still wait for an answer.`,
    fix: `Read them: {{accountSlug}} network inbox${flag}. Answer each inside its thread: {{accountSlug}} network send${flag} --to <their Network ID> --in-reply-to <the message id> --text "..."; a reply marks the unread messages of that thread, up to the one you answer, as read. What needs no answer (a bounce, a notice): {{accountSlug}} network listen${flag} hands it out and marks it read.`,
  };
}

export async function networkDoctor(
  client: PortalClient,
  opts: DoctorOptions,
  deps: DoctorDeps = {},
): Promise<{ result: unknown; exitCode?: number; notice?: string }> {
  const env = deps.env ?? process.env;
  const now = (deps.now ?? Date.now)();
  // --profile only where it is needed (2026-11-16: the fixes said --profile claude-code to an agent already on it): in
  // commands the agent runs, only when it chose a profile by hand; in a cron or launchd line, the agent's own profile,
  // since a scheduler does not carry the environment that names it.
  const flag = profileFlag(opts.profile);
  const cronFlag = profileFlag(opts.profile ?? deps.profileName);
  const gaps: DoctorGap[] = [];
  const advice: DoctorAdvice[] = [];
  const checks: Record<string, unknown> = {};

  // Who this is: a refusal here (no key, a retired agent) is the answer, so it is not caught.
  const me = await client.network.whoami({ assistant: opts.assistant });
  checks.address = me.address;

  // 1. The guide, where this harness reads it.
  const target = installTarget(env, deps.home);
  if (!target) {
    checks.guide = { state: 'unchecked', why: 'no known harness' };
  } else {
    const path = join(target.skillsDir, skillName(), 'SKILL.md');
    const installed = existsSync(path);
    checks.guide = { state: installed ? 'installed' : 'missing', harness: target.harness, path };
    if (!installed && target.harness === 'Claude Code') {
      gaps.push({
        id: 'guide_not_installed',
        problem: 'The guide is not installed where Claude Code reads skills, so a new session will not know how to use the network.',
        fix: '{{accountSlug}} agent-guide --install',
      });
    }
  }

  // 2. A listener. --scheduled is kept, so send and whoami (and doctor without it) go by the same word afterwards.
  const profile = opts.profile ?? deps.profileName;
  if (opts.scheduled) await (deps.markScheduled ?? markScheduledCheck)(profile);
  else if (opts.whenAsked) await (deps.markWhenAsked ?? markWhenAskedCheck)(profile);
  const status = await listenerStatus(client, { assistant: opts.assistant, profile }, { processes: deps.processes, scheduledSince: deps.scheduledSince, whenAskedSince: deps.whenAskedSince });
  checks.listener = status.scheduled && status.webhook.state !== 'active' && status.watcher.running !== true
    ? { ...status, note: 'You said a recurring check takes your mail (doctor --scheduled), and send and whoami go by that too. A reply waits until its next run; nothing here can see that schedule.' }
    : status.whenAsked && status.listening !== true
      ? { ...status, note: 'Your person chose that you check for messages only when they ask (doctor --when-asked), and send and whoami go by that too. Replies wait until they ask you to check; tell them when one may be waiting.' }
      : status;
  gaps.push(...listenerGaps(status, flag, opts.scheduled, cronFlag));

  // 3. The unread backlog. A server with no read state sends no summary: unknown, not none.
  try {
    const page = await client.network.unread({ assistant: opts.assistant });
    if (page.unread && typeof page.unread.count === 'number') {
      checks.unread = { count: page.unread.count, ...(page.unread.senders ? { senders: safeSenders(page.unread.senders) } : {}), oldest: page.unread.oldest ?? null, threads: new Set((page.messages ?? []).map((m) => m.conversation ?? m.id)).size, moreThanShown: !!page.more };
      const gap = backlogGap(page, flag, now);
      if (gap) gaps.push(gap);
    } else {
      checks.unread = { state: 'unknown', why: 'this server keeps no unread summary yet' };
    }
  } catch (err) {
    checks.unread = { state: 'unknown', why: err instanceof AgntApiError ? `the server answered ${err.status}` : 'could not ask' };
  }

  // 4. What to ask the person about. Advice, not a gap: a network key can read the profile but not change it, so the
  //    person sets it in the app, and an agent must not be told to fix what it cannot.
  try {
    const user = await client.me.get();
    const timezone = (user as { timezone?: string | null }).timezone;
    checks.profile = { timezone: timezone ?? null };
    if (!timezone) {
      advice.push({
        id: 'timezone_not_set',
        problem: "Your person's timezone is not set, so times you work out for them may be wrong.",
        advice: 'Ask your person to set their timezone in the {{accountName}} app (never guess it). A key from `network join` cannot change it for them.',
      });
    }
  } catch {
    checks.profile = { state: 'unknown' };
  }

  const ok = gaps.length === 0;
  const unchecked = [
    ...(((checks.guide as { state?: string })?.state === 'unchecked') ? ['whether the guide is installed (this harness is not known)'] : []),
    ...(status.listening === null ? ['whether anything is listening'] : []),
    ...(status.scheduled && status.webhook.state !== 'active' && status.watcher.running !== true ? ['your scheduler (it cannot be seen from here)'] : []),
    ...(((checks.unread as { state?: string })?.state === 'unknown') ? ['the unread backlog'] : []),
    ...(((checks.profile as { state?: string })?.state === 'unknown') ? ['the profile'] : []),
  ];
  const lines = ok
    ? [`ok: no gaps found.${unchecked.length ? ` Could not check: ${unchecked.join('; ')}.` : ''}`]
    : gaps.map((g) => `gap: ${g.problem} Fix: ${g.fix}`);
  lines.push(...advice.map((a) => `advice: ${a.problem} ${a.advice}`));
  return { result: { ok, gaps, ...(advice.length ? { advice } : {}), checks }, exitCode: ok ? 0 : 1, notice: lines.join('\n') };
}

export const runNetworkDoctor = (opts: DoctorOptions) =>
  runNetworkVerb('doctor', async () => {
    const profile = await networkProfile(opts.profile);
    return networkDoctor(await clientFor(profile), opts, { profileName: profile });
  });
