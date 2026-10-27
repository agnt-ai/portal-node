/**
 * Which agent is running this CLI, from what its runtime leaves in the environment. It names the agent's
 * default profile for the network commands, so two agents on one computer (say Claude Code and Codex) never
 * share keys, and an older profile made by hand is never picked up by accident.
 */

import { listProfileNames } from './credentials.js';
import { envProfileName } from '../../defaults.js';

/** The agent product: "Claude Code", "Codex", "Cursor", or "Agent" when unknown. */
export function guessProduct(env: NodeJS.ProcessEnv = process.env): string {
  if (env.CLAUDECODE || env.CLAUDE_CODE_ENTRYPOINT) return 'Claude Code';
  const names = Object.keys(env);
  if (names.some((n) => n.startsWith('CODEX_'))) return 'Codex';
  if (names.some((n) => n.startsWith('CURSOR_'))) return 'Cursor';
  return 'Agent';
}

/** The agent's own profile name: claude-code, codex, cursor or agent. */
export function agentProfileName(env: NodeJS.ProcessEnv = process.env): string {
  return guessProduct(env).toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/** A detected agent with no profile of its own yet: it must join first, never borrow another profile. */
export class NotJoinedError extends Error {
  constructor(readonly profile: string) {
    super(`You haven't joined yet: run \`{{accountSlug}} network join --email <your user's email>\``);
    this.name = 'NotJoinedError';
  }
}

/**
 * The profile a network command uses: --profile when given, else NETWORK_CLI_PROFILE (or AGNT_CLI_PROFILE), else, for a detected agent
 * (Claude Code, Codex, Cursor), its own profile, refused with NotJoinedError until it has joined. With no
 * agent detected: the "agent" profile when one joined under it, else undefined, leaving the usual default
 * (for scripts) to the caller.
 */
export async function networkProfile(explicit?: string, env: NodeJS.ProcessEnv = process.env): Promise<string | undefined> {
  if (explicit) return explicit;
  const fromEnv = envProfileName(env);
  if (fromEnv) return fromEnv;
  const own = agentProfileName(env);
  const names = await listProfileNames().catch(() => [] as string[]);
  if (names.includes(own)) return own;
  // No agent detected: a script, or an agent join could not name. Its "agent" profile when it joined, else the default.
  if (guessProduct(env) === 'Agent') return undefined;
  throw new NotJoinedError(own);
}
