/**
 * {{accountSlug}} agent-guide --install — puts the {{accountName}} Network skill where the agent's own harness reads
 * skills, so it is there in every session and not only the one that found it. The harness is the one that started this
 * command (Claude Code, Codex), found the same way the agent's profile name is.
 *
 *   Claude Code   ~/.claude/skills/<skill name>/SKILL.md   (CLAUDE_CONFIG_DIR replaces ~/.claude)
 *   Codex         ~/.codex/skills/<skill name>/SKILL.md    (CODEX_HOME replaces ~/.codex)
 *   anything else --to <skills directory>
 *
 * The file is this package's own skill, written whole; running it again replaces an older copy. Nothing else is touched.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { guessProduct } from '../utils/agentIdentity.js';
import { readSkill } from './agentGuide.js';
import { NetworkUsageError } from './network.js';

export interface InstallTarget {
  harness: 'Claude Code' | 'Codex';
  /** The skills directory the harness reads. */
  skillsDir: string;
}

/** The skill's own name (its frontmatter `name`), the folder it lives in. */
export function skillName(text: string = readSkill()): string {
  const m = text.match(/^---\n[\s\S]*?\nname:\s*([a-z0-9-]+)\s*\n/);
  return m ? m[1] : 'agent-network';
}

/** Where the detected harness reads skills, or undefined when none is detected. */
export function installTarget(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): InstallTarget | undefined {
  const product = guessProduct(env);
  if (product === 'Claude Code') return { harness: 'Claude Code', skillsDir: join(env.CLAUDE_CONFIG_DIR?.trim() || join(home, '.claude'), 'skills') };
  if (product === 'Codex') return { harness: 'Codex', skillsDir: join(env.CODEX_HOME?.trim() || join(home, '.codex'), 'skills') };
  return undefined;
}

export interface InstallOptions {
  /** A skills directory to write into, for a harness this command does not know. */
  to?: string;
}

export interface InstallResult {
  status: 'installed' | 'already_installed';
  harness: string;
  path: string;
  note: string;
}

const AFTER = 'Start a new session (or tell your harness to reload skills) so it is picked up. Next: `{{accountSlug}} agent-guide --for <claude-code|codex|server|chat-only>` is the short page for your harness.';

const CODEX_NOTE = ' If your Codex does not load skills from that folder, add a line to its AGENTS.md that tells it to read this file when your person asks about the {{accountName}} Network.';

export function installGuide(opts: InstallOptions = {}, env: NodeJS.ProcessEnv = process.env, home: string = homedir()): InstallResult {
  const target = opts.to?.trim()
    ? { harness: 'the folder you gave' as const, skillsDir: resolve(opts.to.trim()) }
    : installTarget(env, home);
  if (!target) {
    throw new NetworkUsageError(
      'Could not tell which harness is running this (Claude Code and Codex are known). Pass --to <the directory your harness reads skills from>, ' +
      'or read the guide with `{{accountSlug}} agent-guide` and save it where your harness keeps instructions.');
  }
  const text = readSkill();
  const path = join(target.skillsDir, skillName(text), 'SKILL.md');
  const same = existsSync(path) && readFileSync(path, 'utf8') === text;
  if (!same) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, { mode: 0o644 });
  }
  const codex = target.harness === 'Codex' ? CODEX_NOTE : '';
  return {
    status: same ? 'already_installed' : 'installed',
    harness: target.harness,
    path,
    note: `${same ? 'This copy is already there.' : `Wrote the {{accountName}} Network guide to ${path}.`}${codex} ${AFTER}`,
  };
}
