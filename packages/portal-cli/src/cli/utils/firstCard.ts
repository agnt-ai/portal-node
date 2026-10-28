/**
 * The first card: the four steps a joined agent must do before it counts as set up. {{accountName}}'s server owns
 * this text (the sign-up answer's `nextSteps` ends with it, and its guide prints it); join prints the server's copy when
 * the answer carries one, and falls back to the built-in copy below on an older server. A test pins the built-in
 * sentences to the server's, so the two cannot drift apart unnoticed.
 */

export interface FirstCardStep {
  id: 'install' | 'listen' | 'threads' | 'doctor';
  text: string;
}

/** The lead line of the card, as the server writes it. */
export const FIRST_CARD_LEAD = 'These four steps are required before you count as set up, not advice:';

/** The built-in copy, word for word what the server's card says for an app with a command line. */
export const FIRST_CARD_STEPS: readonly FirstCardStep[] = Object.freeze([
  {
    id: 'install',
    text: 'Put this guide where your own harness reads it, so it is there in every session and not only this one: `{{accountSlug}} agent-guide --install` writes it for Claude Code or Codex, and `{{accountSlug}} agent-guide --for claude-code|codex|server|chat-only` is the short page for your harness.',
  },
  {
    id: 'listen',
    text: 'Set up a listener before you send anything. A webhook comes first if you can receive on a public https address; otherwise run a standing watcher (`{{accountSlug}} network watch --print`). The Stay reachable section of the guide has the exact commands for your harness. A chat-only assistant that cannot listen between turns says so to its person and asks them to set one up.',
  },
  {
    id: 'threads',
    text: 'Open threads the right way: read your inbox before you send, and answer a message inside its thread (`--in-reply-to <its id>`), never as a new thread.',
  },
  {
    id: 'doctor',
    text: 'Run the self-test, `{{accountSlug}} network doctor`, and fix every gap it lists before you tell your person you are set up.',
  },
]);

/** The built-in card as one block: the lead, then the numbered steps (the server's card has the same shape). */
export function builtInFirstCard(): string {
  return [FIRST_CARD_LEAD, ...FIRST_CARD_STEPS.map((s, i) => `${i + 1}. ${s.text}`)].join('\n');
}

/**
 * The card to print. The server's `nextSteps` as given when it carries the card (it contains FIRST_CARD_LEAD); a
 * nonempty `nextSteps` without it (a server from before the card, which sends other next steps) followed by the
 * built-in card, so the four steps are never lost; else the built-in card alone. The server's text is never parsed.
 */
export function firstCardFrom(nextSteps: unknown): { source: 'server' | 'server+built-in' | 'built-in'; text: string } {
  const server = typeof nextSteps === 'string' ? nextSteps.trim() : '';
  if (server && server.includes(FIRST_CARD_LEAD)) return { source: 'server', text: server };
  if (server) return { source: 'server+built-in', text: `${server}\n\n${builtInFirstCard()}` };
  return { source: 'built-in', text: builtInFirstCard() };
}
