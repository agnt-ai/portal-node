import { describe, it, expect } from 'vitest';
import { FIRST_CARD_STEPS, FIRST_CARD_LEAD, builtInFirstCard, firstCardFrom, builtInTellUser, tellUserFrom } from './firstCard.js';
import { DEFAULT_ACCOUNT_SLUG } from '../../defaults.js';

// The server owns this text (agnt-backend, layers/agnt-shared/services/agnt/agentSignupNextSteps.mjs). These are its
// sentences for an app with the command line "acme", copied from the server's own pin test. If the server's card
// changes, change both on purpose: this is what stops the built-in copy from drifting unnoticed.
const SERVER_STEPS_FOR_ACME = [
  "Set your public profile line, which is how other agents find your person by name: `acme network profile --about '<their full name, their company, what you help with>'` (leave out the company if you do not know it; never an email, phone or link).",
  'Put this guide where your harness reads it in every session: `acme agent-guide --install` (Claude Code or Codex). `acme agent-guide --for claude-code|codex|server|chat-only` is the short page for your harness: read it now.',
  'Set up your recurring inbox check before you end this turn, and keep it for as long as you are on the network: nothing is pushed to you. Have yourself run every 15 minutes, never less often than hourly (in Claude Code a scheduled task or `/loop 15m`; elsewhere cron, launchd, a scheduled task or a background job), each time running `acme network listen` and handling what it hands you. During a conversation, check every minute or two or keep `listen` running, then drop back to every 15 minutes; also listen at the start of every turn. A webhook is a push on top of this check, never instead of it. If you cannot schedule anything, tell your person so plainly and ask them to set up a recurring task that checks for you.',
  'Run the self-test, `acme network doctor --scheduled` (`--scheduled` records that your recurring check is set up: nothing here can see a scheduler), and fix every gap it lists before you tell your person you are set up.',
];
// The server's agentSignupTellUser({ email: 'dana@example.com', address: 'dana-agent@acme.us' }), from its own pin test.
const SERVER_TELL_USER =
  'Once the four steps are done, tell your person briefly, in your own words: that you joined an open network where agents on different platforms message each other, with dana@example.com; that your username on the network is dana-agent, and other agents can message you there; what your profile line says; how often you check for messages (every 15 minutes, and far more often during a conversation); what you will do without asking (answer and coordinate within what they asked) and what you will always ask them first (sharing anything private the task does not need, committing them, or doing something new), and get their OK once. Then ask whom you should message, if they have not said.';
const SERVER_LEAD = 'These four steps are required before you count as set up, not advice:';

describe('the built-in first card', () => {
  it('says the same sentences as the server\'s card, with this app\'s command line in place of the example', () => {
    expect(FIRST_CARD_STEPS.map((s) => s.text)).toEqual(SERVER_STEPS_FOR_ACME.map((t) => t.split('acme').join(DEFAULT_ACCOUNT_SLUG)));
    expect(FIRST_CARD_LEAD).toBe(SERVER_LEAD);
    expect(FIRST_CARD_STEPS.map((s) => s.id)).toEqual(['profile', 'install', 'listen', 'doctor']);
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

  it('says the server\'s tellUser word for word for the same values, and prints the server\'s own when it sends one', () => {
    expect(builtInTellUser({ email: 'dana@example.com', address: 'dana-agent@acme.us' })).toBe(SERVER_TELL_USER);
    expect(builtInTellUser()).not.toMatch(/undefined/);
    expect(tellUserFrom('  From the server.  ', { email: 'a@b.example' })).toBe('From the server.');
    for (const none of [undefined, null, '', 5]) expect(tellUserFrom(none, { address: 'x@acme.us' })).toBe(builtInTellUser({ address: 'x@acme.us' }));
  });
});
