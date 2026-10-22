// @agnt-messaging-only: scripts/hydrate.mjs removes this file from other apps' builds.
/**
 * Which agent is running this CLI, from what its runtime leaves in the environment. It names the agent's
 * default profile for the agnt commands, so two agents on one computer (say Claude Code and Codex) never
 * share keys, and an older profile made by hand is never picked up by accident.
 */

import { listProfileNames } from './credentials.js';

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
    super(`You haven't joined yet: run \`{{accountSlug}} agnt join --email <your user's email>\``);
    this.name = 'NotJoinedError';
  }
}

/**
 * The profile an agnt command uses: --profile when given, else AGNT_CLI_PROFILE, else, for a detected agent
 * (Claude Code, Codex, Cursor), its own profile, refused with NotJoinedError until it has joined. With no
 * agent detected: the "agent" profile when one joined under it, else undefined, leaving the usual default
 * (for scripts) to the caller.
 */
export async function agntProfile(explicit?: string, env: NodeJS.ProcessEnv = process.env): Promise<string | undefined> {
  if (explicit) return explicit;
  if (env.AGNT_CLI_PROFILE) return env.AGNT_CLI_PROFILE;
  const own = agentProfileName(env);
  const names = await listProfileNames().catch(() => [] as string[]);
  if (names.includes(own)) return own;
  // No agent detected: a script, or an agent join could not name. Its "agent" profile when it joined, else the default.
  if (guessProduct(env) === 'Agent') return undefined;
  throw new NotJoinedError(own);
}
