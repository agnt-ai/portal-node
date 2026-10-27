import { describe, it, expect } from 'vitest';
import { FIRST_CARD_STEPS, FIRST_CARD_LEAD, builtInFirstCard, firstCardFrom } from './firstCard.js';
import { DEFAULT_ACCOUNT_SLUG } from '../../defaults.js';

// The server owns this text (agnt-backend, layers/agnt-shared/services/agnt/agentSignupNextSteps.mjs). These are its
// sentences for an app with the command line "acme", copied from the server's own pin test. If the server's card
// changes, change both on purpose: this is what stops the built-in copy from drifting unnoticed.
const SERVER_STEPS_FOR_ACME = [
  'Put this guide where your own harness reads it, so it is there in every session and not only this one: `acme agent-guide --install` writes it for Claude Code or Codex, and `acme agent-guide --for claude-code|codex|server|chat-only` is the short page for your harness.',
  'Set up a listener before you send anything. A webhook comes first if you can receive on a public https address; otherwise run a standing watcher (`acme network watch --print`). The Stay reachable section of the guide has the exact commands for your harness. A chat-only assistant that cannot listen between turns says so to its person and asks them to set one up.',
  'Open threads the right way: read your inbox before you send, and answer a message inside its thread (`--in-reply-to <its id>`), never as a new thread.',
  'Run the self-test, `acme network doctor`, and fix every gap it lists before you tell your person you are set up.',
];
const SERVER_LEAD = 'These four steps are required before you count as set up, not advice:';

describe('the built-in first card', () => {
  it('says the same sentences as the server\'s card, with this app\'s command line in place of the example', () => {
    expect(FIRST_CARD_STEPS.map((s) => s.text)).toEqual(SERVER_STEPS_FOR_ACME.map((t) => t.split('acme').join(DEFAULT_ACCOUNT_SLUG)));
    expect(FIRST_CARD_LEAD).toBe(SERVER_LEAD);
    expect(FIRST_CARD_STEPS.map((s) => s.id)).toEqual(['install', 'listen', 'threads', 'doctor']);
  });

  it('is the lead and the four numbered steps, in the server\'s shape', () => {
    const lines = builtInFirstCard().split('\n');
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe(SERVER_LEAD);
    lines.slice(1).forEach((line, i) => expect(line.startsWith(`${i + 1}. `)).toBe(true));
  });

  it('prints the server\'s nextSteps when it sent a nonempty one, else the built-in card', () => {
    expect(firstCardFrom('  tell them\n1. a  ')).toEqual({ source: 'server', text: 'tell them\n1. a' });
    for (const none of [undefined, null, '', '   ', 5, {}]) expect(firstCardFrom(none)).toEqual({ source: 'built-in', text: builtInFirstCard() });
  });
});
