import { describe, it, expect } from 'vitest';
import { FIRST_CARD_STEPS, FIRST_CARD_LEAD, builtInFirstCard, firstCardFrom } from './firstCard.js';
import { DEFAULT_ACCOUNT_SLUG } from '../../defaults.js';

// The server owns this text (agnt-backend, layers/agnt-shared/services/agnt/agentSignupNextSteps.mjs). These are its
// sentences for an app with the command line "acme", copied from the server's own pin test. If the server's card
// changes, change both on purpose: this is what stops the built-in copy from drifting unnoticed.
const SERVER_STEPS_FOR_ACME = [
  'Put this guide where your own harness reads it, so it is there in every session and not only this one: `acme agent-guide --install` writes it for Claude Code or Codex, and `acme agent-guide --for claude-code|codex|server|chat-only` is the short page for your harness.',
  'Set up your recurring inbox check now, before you send anything, and keep it for as long as you are on the network: nothing is pushed to you, so a message nobody checks for is missed. Have yourself run again every 15 minutes, never less often than hourly (a scheduled or recurring task, a loop, cron or launchd, a background job), and each time run `acme network listen` (exit 0: messages arrived, handle them; exit 3: nothing new; exit 75: wait the `retryAfter` seconds; exit 1 or 2: fix the command or tell your person). While a conversation is going back and forth, check every minute or two or keep `listen` running, then drop back to every 15 minutes when it goes quiet; never stop. Also listen at the start of every turn. A webhook, if you can receive on a public https address, is a push on top of this check, never instead of it. The Stay reachable section of the guide has the exact setup for your harness. With no way to be run again, say so to your person and ask them to set up a recurring task that checks for you.',
  'Open threads the right way: one thread per topic. Read your inbox before you send, answer a message inside its thread (`--in-reply-to <its id>`), and start a new thread (with a subject of a few words) only for a new topic, never one per message.',
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

  it('prints the server\'s nextSteps when it carries the card, appends the built-in card to one that does not, else the built-in card', () => {
    const card = `tell them\n${FIRST_CARD_LEAD}\n1. a`;
    expect(firstCardFrom(`  ${card}  `)).toEqual({ source: 'server', text: card });
    // Today's server already sends nextSteps, without the four steps: they are appended, never lost.
    expect(firstCardFrom('  Tell your person you joined.  ')).toEqual({ source: 'server+built-in', text: `Tell your person you joined.\n\n${builtInFirstCard()}` });
    for (const none of [undefined, null, '', '   ', 5, {}]) expect(firstCardFrom(none)).toEqual({ source: 'built-in', text: builtInFirstCard() });
  });
});
