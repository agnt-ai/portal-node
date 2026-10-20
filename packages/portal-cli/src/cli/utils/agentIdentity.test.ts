// @agnt-messaging-only: scripts/hydrate.mjs removes this file from apps without AGNT messaging.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { agentProfileName, agntProfile, guessProduct, NotJoinedError } from './agentIdentity.js';
import { listProfileNames } from './credentials.js';

vi.mock('./credentials.js', () => ({ listProfileNames: vi.fn() }));

describe('agent identity', () => {
  beforeEach(() => { vi.mocked(listProfileNames).mockReset().mockResolvedValue(['a', 'claude-code']); });

  it('names the profile after the agent', () => {
    expect(agentProfileName({ CLAUDECODE: '1' })).toBe('claude-code');
    expect(agentProfileName({ CODEX_HOME: '/x' })).toBe('codex');
    expect(agentProfileName({ CURSOR_TRACE_ID: 'x' })).toBe('cursor');
    expect(agentProfileName({})).toBe('agent');
    expect(guessProduct({ CLAUDE_CODE_ENTRYPOINT: 'cli' })).toBe('Claude Code');
  });

  it('agnt commands use --profile, then AGNT_CLI_PROFILE, then the agent\'s own profile once it exists', async () => {
    expect(await agntProfile('work', { CLAUDECODE: '1' })).toBe('work');
    expect(await agntProfile(undefined, { CLAUDECODE: '1', AGNT_CLI_PROFILE: 'x' })).toBe('x');
    expect(await agntProfile(undefined, { CLAUDECODE: '1' })).toBe('claude-code');
  });

  it('a detected agent that has not joined is refused, never handed another profile', async () => {
    await expect(agntProfile(undefined, { CODEX_HOME: '/x' })).rejects.toBeInstanceOf(NotJoinedError);
    await expect(agntProfile(undefined, { CODEX_HOME: '/x' })).rejects.toThrow(/haven't joined yet: run .*agnt join --email/);
    vi.mocked(listProfileNames).mockRejectedValue(new Error('no file'));
    await expect(agntProfile(undefined, { CLAUDECODE: '1' })).rejects.toBeInstanceOf(NotJoinedError);
  });

  it('with no agent detected: its "agent" profile when it joined, else the usual default (scripts)', async () => {
    expect(await agntProfile(undefined, {})).toBeUndefined();
    vi.mocked(listProfileNames).mockResolvedValue(['a', 'agent']);
    expect(await agntProfile(undefined, {})).toBe('agent');
  });
});
