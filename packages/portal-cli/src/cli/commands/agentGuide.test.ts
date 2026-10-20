// @agnt-messaging-only: scripts/hydrate.mjs removes this file from other apps' builds.
import { describe, it, expect } from 'vitest';
import { AGENT_GUIDE, CONVERSATION } from './agentGuide.js';

describe('agent-guide', () => {
  it('calls the issued address the OpenAssistant Network ID, and never an email', () => {
    expect(AGENT_GUIDE).toMatch(/Prints your OpenAssistant Network ID/);
    expect(AGENT_GUIDE).toMatch(/Call\s+it that, never an email: it is not a mailbox/);
    // "AGNT" only ever as "AGNT Protocol", and said once, plainly.
    expect(AGENT_GUIDE.replace(/AGNT Protocol/g, '')).not.toMatch(/AGNT/);
    expect(AGENT_GUIDE).toMatch(/runs on the open AGNT Protocol, so you can also reach agents on any\s+other AGNT Protocol network by their network address/);
    expect(CONVERSATION).not.toMatch(/AGNT/);
    expect(AGENT_GUIDE).toMatch(/^The OpenAssistant Network for AI agents/);
    expect(AGENT_GUIDE).toMatch(/agnt leave --confirm <your Network ID>/);
  });

  it('makes keeping the conversation going the default', () => {
    const section = AGENT_GUIDE.slice(AGENT_GUIDE.indexOf('KEEP THE CONVERSATION GOING'), AGENT_GUIDE.indexOf('PRESENTING'));
    expect(section).toMatch(/reply yourself whenever the answer is within what they asked/);
    expect(section).toMatch(/Don't wait for\s+their permission to answer/);
    expect(section).toMatch(/a decision, private information they haven't\s+shared, or spending/);
    expect(section).toMatch(/agnt wait --from <them> --timeout 300/);
    expect(section).toMatch(/after 3 timeouts in a row/);
    expect(section).toMatch(/in the background and wake you when it exits/);
    expect(section).toMatch(/At the start of every turn, run "agnt wait --timeout 0" until it exits 3/);
  });

  it('the live-test rules: one email per agent, wait is the one way to get new messages, minutes not seconds', () => {
    expect(AGENT_GUIDE).toMatch(/one per agent: each email signs up one agent/);
    expect(AGENT_GUIDE).toMatch(/Never pick their account email, their git email, or one another of their agents uses/);
    expect(AGENT_GUIDE).toMatch(/agnt wait\s+is the one way to get messages you haven't seen yet/);
    expect(AGENT_GUIDE).toMatch(/is read-only history: it marks\s+nothing as shown, so wait still shows those messages/);
    expect(AGENT_GUIDE).toMatch(/Replies take minutes, not seconds/);
    expect(AGENT_GUIDE).toMatch(/Pass ids in full, 64 hex characters/);
    expect(AGENT_GUIDE).toMatch(/"pending", then "delivered"/);
    expect(AGENT_GUIDE).toMatch(/takes one message as wait or inbox printed it/);
    expect(AGENT_GUIDE).toMatch(/open with a short message that says\s+who you are, who you act for, and why you're writing/);
  });

  it('the one-paragraph form says the same', () => {
    for (const part of ['reply yourself', "don't wait for permission", 'spending', '--timeout 300', 'in the background', '3 timeouts in a row', 'wait --timeout 0']) {
      expect(CONVERSATION).toContain(part);
    }
  });
});
