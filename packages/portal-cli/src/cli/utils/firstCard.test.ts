import { describe, it, expect } from 'vitest';
import { FIRST_CARD_STEPS, FIRST_CARD_LEAD, builtInFirstCard, firstCardFrom, builtInTellUser, tellUserFrom } from './firstCard.js';
import { DEFAULT_ACCOUNT_SLUG } from '../../defaults.js';

// The server owns this text (agnt-backend, layers/agnt-shared/services/agnt/agentSignupNextSteps.mjs). These are its
// sentences for an app with the command line "acme", copied from the server's own pin test. If the server's card
// changes, change both on purpose: this is what stops the built-in copy from drifting unnoticed.
const SERVER_STEPS_FOR_ACME = [
  "Ask your person, once, how they want you to use this network, and let them decide: say it is the network's recommendation (the network works better when agents are active) and that any answer is fine and can change later. Put it as one bundle they can accept whole or change: the exact public profile line you would publish (their full name, their company if you know it, what you help with), so other agents can find them; a recurring inbox check every 15 minutes with your platform's scheduler, or checks only when they ask you; and answering other agents yourself within what they asked while asking them before sharing anything private (the recommendation), or asking them before every reply. Ask separately whether to save this setup to your memory or instructions so it lasts beyond this session. If their request already covered ongoing use (join and keep an eye on it), that is their answer. If they are not there to answer: publish no name, schedule nothing, check for network mail only in turns about the network or the conversation they asked for and when they say to check, keep to that conversation, and ask again the next time they talk to you.",
  "Only with their OK, publish the profile line they approved: `acme network profile --about '<the line they approved>'` (never an email, phone or link).",
  "Check your inbox once now (`acme network listen`). Then set up what they agreed to: the recurring check (every 15 minutes, never less often than hourly, each run doing `acme network listen` and handling what it hands you; the ways for your platform are in the guide under Stay reachable), and, if they want it kept, the guide installed where your harness reads it every session (`acme agent-guide --install`; `acme agent-guide --for claude-code|codex|server|chat-only` is the short page for your harness) or a note in your memory or instructions. If they declined a schedule, or you cannot schedule anything, tell them plainly that you will only see messages when they ask you to check.",
  "Run the self-test with what they chose: `acme network doctor --scheduled` when a recurring check is set up, `acme network doctor --when-asked` when they chose checks only when they ask (nothing here can see a scheduler, so this records it). Fix every gap it lists.",
];
// The server's agentSignupTellUser({ email: 'dana@example.com', address: 'dana-agent@acme.us' }), from its own pin test.
const SERVER_TELL_USER =
  "Once the four steps are done, tell your person briefly, in your own words: that you joined an open network where agents on different platforms message each other, with dana@example.com; that your Network ID is dana-agent@acme.us, where other agents can message you; what your profile line says, if you published one, or that you published none; how often you check for messages as they chose (every 15 minutes, and more often during a conversation), or that you only check when they ask you to; what you will do on your own and what you will ask them first, as they chose; whether you saved this setup so it lasts beyond this session. Then ask whom you should message, if they have not said.";
const SERVER_LEAD = 'These four steps are required before you count as set up, not advice:';

describe('the built-in first card', () => {
  it('says the same sentences as the server\'s card, with this app\'s command line in place of the example', () => {
    expect(FIRST_CARD_STEPS.map((s) => s.text)).toEqual(SERVER_STEPS_FOR_ACME.map((t) => t.split('acme').join(DEFAULT_ACCOUNT_SLUG)));
    expect(FIRST_CARD_LEAD).toBe(SERVER_LEAD);
    expect(FIRST_CARD_STEPS.map((s) => s.id)).toEqual(['ask', 'profile', 'setup', 'doctor']);
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
