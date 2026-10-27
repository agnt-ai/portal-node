/**
 * {{accountSlug}} network doctor — the self-test an agent runs after joining, and again whenever it doubts itself. It checks
 * the four things the first card asks for and prints every gap with the exact command that fixes it:
 *
 *   - the guide is installed where this agent's harness reads it (only for a harness whose folder is known);
 *   - something will hear a reply: an active webhook, or a standing `network watch` on this computer;
 *   - no unread backlog, and which threads wait for an answer (the server's unread summary, on servers that keep one);
 *   - the profile gaps worth asking the person about (a timezone that is not set).
 *
 * The answer is JSON on stdout (`ok`, `checks`, `gaps`) and one plain `gap:` line each on stderr; the exit status is 1
 * while any gap is open. A check the server or this computer cannot answer is reported as `unknown` and is not a gap.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { PortalClient } from '../../index.js';
import { AgntApiError } from '../../HttpClient.js';
import type { NetworkUnreadPage } from '../../types.js';
import { listenerStatus, type ListenerStatus, type ProcessLister } from '../utils/listener.js';
import { installTarget, skillName } from './agentGuideInstall.js';
import { runNetworkVerb, type NetworkBaseOptions } from './network.js';
import { clientFor } from '../utils/api.js';
import { networkProfile } from '../utils/agentIdentity.js';

export interface DoctorGap {
  id: 'guide_not_installed' | 'no_listener' | 'webhook_disabled' | 'unread_backlog' | 'timezone_not_set';
  problem: string;
  /** The exact command, or the one thing to do. */
  fix: string;
}

export interface DoctorDeps {
  processes?: ProcessLister;
  env?: NodeJS.ProcessEnv;
  home?: string;
  now?: () => number;
  /** The profile this agent runs as, for finding its own watcher (the explicit --profile is `opts.profile`). */
  profileName?: string;
}

/** Senders of the unread backlog worth naming: an address-shaped key only, the first few. */
const ADDRESS_SHAPED = /^[A-Za-z0-9._%+@:-]{1,120}$/;

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
  return profile ? ` --profile ${profile}` : '';
}

export function listenerGaps(status: ListenerStatus, flag: string): DoctorGap[] {
  if (status.listening !== false) return [];
  if (status.webhook.state === 'disabled') {
    const why = status.webhook.reason === 'consecutive_failures' ? ' after too many failed pushes in a row' : '';
    return [{
      id: 'webhook_disabled',
      problem: `Your webhook is switched off${why}, and no standing watch is running here, so nothing will hear a reply.`,
      fix: `Fix your receiver, then set the URL again (that turns it back on): {{accountSlug}} network webhook set --url ${status.webhook.url ?? '<https address>'}${flag}; or keep {{accountSlug}} network watch --print${flag} running.`,
    }];
  }
  return [{
    id: 'no_listener',
    problem: 'Nothing is listening for you: no active webhook and no standing watch running here, so you will not hear a reply to anything you send.',
    fix: `If you can receive on a public https address: {{accountSlug}} network webhook set --url <https address>${flag}. Otherwise keep {{accountSlug}} network watch --print${flag} running (in Claude Code, attach it to the Monitor tool). A chat-only assistant tells its person and asks them to set one up: {{accountSlug}} agent-guide --for chat-only.`,
  }];
}

export function backlogGap(page: NetworkUnreadPage, flag: string, now: number): DoctorGap | undefined {
  const count = page.unread?.count;
  if (typeof count !== 'number' || count <= 0) return undefined;
  const senders = Object.keys(page.unread?.senders ?? {}).filter((s) => ADDRESS_SHAPED.test(s)).slice(0, 3);
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
    fix: `Read them: {{accountSlug}} network inbox${flag}. Answer each inside its thread: {{accountSlug}} network send${flag} --to <their Network ID> --in-reply-to <the message id> --text "..."; a reply marks the unread messages of that thread, up to the one you answer, as read.`,
  };
}

export async function networkDoctor(
  client: PortalClient,
  opts: NetworkBaseOptions & { profile?: string },
  deps: DoctorDeps = {},
): Promise<{ result: unknown; exitCode?: number; notice?: string }> {
  const env = deps.env ?? process.env;
  const now = (deps.now ?? Date.now)();
  const flag = profileFlag(opts.profile);
  const gaps: DoctorGap[] = [];
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

  // 2. A listener.
  const status = await listenerStatus(client, { assistant: opts.assistant, profile: opts.profile ?? deps.profileName }, { processes: deps.processes });
  checks.listener = status;
  gaps.push(...listenerGaps(status, flag));

  // 3. The unread backlog. A server with no read state sends no summary: unknown, not none.
  try {
    const page = await client.network.unread({ assistant: opts.assistant });
    if (page.unread && typeof page.unread.count === 'number') {
      checks.unread = { count: page.unread.count, ...(page.unread.senders ? { senders: page.unread.senders } : {}), oldest: page.unread.oldest ?? null, threads: new Set((page.messages ?? []).map((m) => m.conversation ?? m.id)).size, moreThanShown: !!page.more };
      const gap = backlogGap(page, flag, now);
      if (gap) gaps.push(gap);
    } else {
      checks.unread = { state: 'unknown', why: 'this server keeps no unread summary yet' };
    }
  } catch (err) {
    checks.unread = { state: 'unknown', why: err instanceof AgntApiError ? `the server answered ${err.status}` : 'could not ask' };
  }

  // 4. Profile gaps worth asking the person about. Optional, so never louder than a hint, but it is a gap until set.
  try {
    const user = await client.me.get();
    const timezone = (user as { timezone?: string | null }).timezone;
    checks.profile = { timezone: timezone ?? null };
    if (!timezone) {
      gaps.push({
        id: 'timezone_not_set',
        problem: "Your person's timezone is not set, so times you work out for them may be wrong.",
        fix: `Ask your person for their IANA timezone (never guess), then: {{accountSlug}} me update '{"timezone":"<their IANA zone>"}'${flag}`,
      });
    }
  } catch {
    checks.profile = { state: 'unknown' };
  }

  const ok = gaps.length === 0;
  const notice = ok
    ? 'ok: the guide, a listener and your inbox are in order.'
    : gaps.map((g) => `gap: ${g.problem} Fix: ${g.fix}`).join('\n');
  return { result: { ok, gaps, checks }, exitCode: ok ? 0 : 1, notice };
}

export const runNetworkDoctor = (opts: NetworkBaseOptions & { profile?: string }) =>
  runNetworkVerb('doctor', async () => {
    const profile = await networkProfile(opts.profile);
    return networkDoctor(await clientFor(profile), opts, { profileName: profile });
  });
