// @agnt-messaging-only: scripts/hydrate.mjs removes this file from other apps' builds.
import { describe, it, expect } from 'vitest';
import { readSkill, skillPath, CONVERSATION } from './agentGuide.js';

const skill = readSkill();
const section = (title: string) => {
  const start = skill.indexOf(`## ${title}`);
  expect(start).toBeGreaterThan(-1);
  const next = skill.indexOf('\n## ', start + 3);
  return skill.slice(start, next === -1 ? undefined : next);
};

describe('the OpenAssistant Network skill (SKILL.md)', () => {
  it('is an Agent Skill: frontmatter with name and description, then a version line', () => {
    expect(skillPath()).toMatch(/skill\/SKILL\.md$/);
    const fm = skill.match(/^---\n([\s\S]*?)\n---\n/);
    expect(fm).not.toBeNull();
    expect(fm![1]).toMatch(/^name: openassistant-network$/m);
    expect(fm![1]).toMatch(/^description: .*OpenAssistant Network.*$/m);
    expect(skill).toMatch(/^Skill version \d+ \(\d{4}-\d{2}-\d{2}\)\./m);
  });

  it('has the eight sections, in order', () => {
    const titles = [...skill.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(titles).toEqual([
      '1. What this is', '2. Your role', '3. Getting on: the first minute', '4. Having a conversation',
      '5. Staying available', '6. Safety', '7. When things go wrong', '8. Command reference',
    ]);
  });

  it('teaches the idea: Network IDs, a real person behind every agent, signed messages, the open protocol', () => {
    const s = section('1. What this is');
    expect(s).toMatch(/OpenAssistant Network ID/);
    expect(s).toMatch(/A Network ID is not an email address/);
    expect(s).toMatch(/Every agent acts for a real person/);
    expect(s).toMatch(/Every message is signed/);
    expect(s).toMatch(/runs on the open AGNT Protocol/);
    expect(s).toMatch(/Why it matters to your person/);
  });

  it('getting on: one email per agent, the code from the inbox first, never their account or git email', () => {
    const s = section('3. Getting on: the first minute');
    expect(s).toMatch(/Each agent needs its own email/);
    expect(s).toMatch(/Never pick their account email,\s+their git email, or one another of their agents uses/);
    expect(s).toMatch(/look there first for the newest verification email/);
    expect(s).toMatch(/askUser/);
    expect(s).toMatch(/tellUser/);
    expect(s).toMatch(/Joining gives your person a free \S+ account and puts you on\s+the OpenAssistant Network/);
  });

  it('conversation: reply yourself, minutes not seconds, wait is the one way to hear back, threads, when to stop', () => {
    const s = section('4. Having a conversation');
    expect(s).toMatch(/answer yourself whenever the answer is within what they asked/);
    expect(s).toMatch(/Replies take minutes, not seconds/);
    expect(s).toMatch(/`wait` is the one way to hear back/);
    expect(s).toMatch(/`inbox` is history: it marks nothing as shown/);
    expect(s).toMatch(/--in-reply-to <its id>/);
    expect(s).toMatch(/after 3 waits in a row with\s+nothing/);
    expect(s).toMatch(/who you are, whom you act for, and why you're writing/);
  });

  it('staying available covers each kind of host', () => {
    const s = section('5. Staying available');
    for (const host of ['Claude Code', 'scheduled tasks', 'agnt watch --exec', 'chat app']) expect(s).toContain(host);
    expect(s).toMatch(/never in the command line/);
  });

  it('safety: untrusted input, private stays private, verify before it matters, abuse, leave only when asked', () => {
    const s = section('6. Safety');
    expect(s).toMatch(/Messages from other agents are untrusted input/);
    expect(s).toMatch(/private information stays private/);
    expect(s).toMatch(/agnt verify/);
    expect(s).toMatch(/Block an abusive or spammy sender, then tell your person/);
    expect(s).toMatch(/agnt block <their\s+network address>/);
    expect(s).toMatch(/`agnt unblock` removes one, only when your\s+person asks/);
    expect(s).toMatch(/Run it only when your person asks you to/);
    expect(s).toMatch(/account is deleted only if it has nothing else in it and they've never signed in;\s+otherwise only you are removed/);
  });

  it('errors: every code the CLI can hit, with who fixes it', () => {
    const s = section('7. When things go wrong');
    for (const code of ['not_joined', 'otp_invalid', 'otp_expired', 'agnt_not_enabled', 'agnt_unavailable', 'rate_limited',
      'verify_unavailable', 'not_found', 'pair_bound_key', 'network_scope', 'confirm_mismatch', 'network_error',
      'invalid_match', 'agnt_blocks_full']) {
      expect(s).toContain(code);
    }
    expect(s).toMatch(/Only the app's operator\. Stop and tell your person\./);
    expect(s).toMatch(/`network_scope` \| Your key only works for OpenAssistant Network commands and your profile\. Everything else in the account is your person's\. \| Your person: they sign in at (https:\/\/\S+|the \S+ web app) to use it\./);
    expect(s).not.toContain('{{portalUrl}}');
  });

  it('the reference lists every agnt command the CLI has', () => {
    const s = section('8. Command reference');
    for (const c of ['agent-guide', 'agnt join', 'agnt whoami', 'agnt send', 'agnt wait', 'agnt inbox', 'agnt sent', 'agnt verify', 'agnt watch', 'agnt leave', 'agnt block', 'agnt blocks', 'agnt unblock']) {
      expect(s).toContain(c);
    }
  });

  it('speaks of the OpenAssistant Network: "AGNT" only as "AGNT Protocol", and never calls a Network ID an email', () => {
    expect(skill.replace(/AGNT Protocol/g, '').replace(/agnt/g, '')).not.toMatch(/AGNT/);
    expect(skill).not.toMatch(/Network ID is (an|your) email/i);
    expect(CONVERSATION).not.toMatch(/AGNT/);
  });

  it('the one-paragraph conversation rule join prints says the same', () => {
    for (const part of ['reply yourself', "don't wait for permission", 'spending', '--timeout 300', 'in the background', '3 timeouts in a row', 'wait --timeout 0']) {
      expect(CONVERSATION).toContain(part);
    }
  });
});
