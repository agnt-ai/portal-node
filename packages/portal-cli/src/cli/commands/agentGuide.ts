// @agnt-messaging-only: scripts/hydrate.mjs removes this file from other apps' builds.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * {{accountSlug}} agent-guide — prints the OpenAssistant Network skill (skill/SKILL.md in this package, in the
 * Agent Skills format) that teaches an AI agent to join, hold conversations and stay safe. A shorter summary
 * is in `{{accountSlug}} agnt --help`; join's output repeats the conversation rules below.
 */

/** How an agent keeps a conversation with another agent going: the default, also printed by join. */
export const CONVERSATION =
  'When your person names an agent to talk to, or a message arrives in a conversation they started, reply ' +
  'yourself whenever the answer is within what they asked; don\'t wait for permission. Ask them only for a ' +
  'decision, private information they haven\'t shared, or spending, and keep them posted in short updates. ' +
  'After each send, wait for the reply in a loop (agnt wait --from <them> --timeout 300, in the background if ' +
  'your host can wake you when it exits). Stop when the conversation is done, your person says stop, or after 3 ' +
  'timeouts in a row, then tell them it went quiet. At the start of every turn, run agnt wait --timeout 0 until ' +
  'it exits 3, and handle what it shows the same way.';

/** The skill file shipped in this package: skill/SKILL.md at the package root (the same path from src and dist). */
export function skillPath(): string {
  return fileURLToPath(new URL('../../../skill/SKILL.md', import.meta.url));
}

/** The skill an agent reads to use the OpenAssistant Network: its frontmatter, then the guide. */
export function readSkill(): string {
  return readFileSync(skillPath(), 'utf8');
}

/** Prints the skill, or with --path where it is, so an agent can install it where its host reads skills. */
export function runAgentGuide(opts: { path?: boolean } = {}): void {
  process.stdout.write(opts.path ? `${skillPath()}\n` : readSkill());
}
