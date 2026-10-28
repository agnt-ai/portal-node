import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveProfile, resolveProfile } from '../utils/credentials.js';
import { networkProfile } from '../utils/agentIdentity.js';
import { networkJoin } from './networkJoin.js';

// Changing a username means joining again as a second agent and running both for a while ("Changing your username"
// in the skill). This uses the real credentials file, in a temporary home, to show two profiles live side by side.

const answer = (status: number, body: unknown) => ({ ok: status < 400, status, headers: new Headers(), text: async () => JSON.stringify(body), json: async () => body });
const joined = (username: string, key: string) => ({
  ok: true, user: { id: 'u1', email: 'person@example.com', portalOnboarded: false }, apiKey: key, apiKeyId: `id-${key}`,
  purpose: 'network', agnt: { address: `${username}@agent.example.test`, assistant: `as-${username}`, pair: `p-${username}`, custody: 'custodial' },
});

describe('two agents of one person side by side (the rename path)', () => {
  let home: string;
  const originalFetch = global.fetch;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'cli-two-profiles-'));
    vi.stubEnv('HOME', home);
    vi.stubEnv('USERPROFILE', home);
    vi.stubEnv('CLAUDECODE', '1');
    vi.stubEnv('AGNT_CLI_PROFILE', '');
    vi.stubEnv('NETWORK_CLI_PROFILE', '');
  });
  afterEach(() => { global.fetch = originalFetch; vi.unstubAllEnvs(); rmSync(home, { recursive: true, force: true }); });

  it('a second join under a new --profile signs up and saves beside the first; each profile keeps its own key', async () => {
    const first = vi.fn().mockResolvedValue(answer(201, joined('oldname', 'key-old')));
    global.fetch = first as any;
    await networkJoin({ email: 'person@example.com', code: '1', account: 'acme', apiUrl: 'https://api.example.test', username: 'oldname' });
    expect((await resolveProfile('claude-code')).apiKey).toBe('key-old');

    // Without --profile a second join only reports the first agent: it never signs up again.
    const whoami = vi.fn().mockResolvedValue(answer(200, { address: 'oldname@agent.example.test', pair: {}, custody: { keys: 'custodial', note: '' } }));
    global.fetch = whoami as any;
    const again = await networkJoin({ email: 'person@example.com', account: 'acme', apiUrl: 'https://api.example.test' }) as any;
    expect(again.result.status).toBe('already_joined');
    expect(whoami.mock.calls[0][0]).toMatch(/\/agnt\/whoami/);

    // With a new profile it starts a sign-up (the code), and finishes with the new username.
    const start = vi.fn().mockResolvedValue(answer(200, { ok: true }));
    global.fetch = start as any;
    const step1 = await networkJoin({ email: 'person@example.com', account: 'acme', apiUrl: 'https://api.example.test', profile: 'claude-code-2', username: 'newname' }) as any;
    expect(step1.result.status).toBe('code_sent');
    expect(start.mock.calls[0][0]).toBe('https://api.example.test/portal/auth/agent/start');
    expect(step1.result.next).toMatch(/--username newname --profile claude-code-2 .*--code <the code>$/);
    global.fetch = vi.fn().mockResolvedValue(answer(201, joined('newname', 'key-new'))) as any;
    const done = await networkJoin({ email: 'person@example.com', code: '2', account: 'acme', apiUrl: 'https://api.example.test', profile: 'claude-code-2', username: 'newname' }) as any;
    expect(done.result.next[0]).toMatch(/network send --profile claude-code-2 /);
    expect(done.result.next[1]).toMatch(/network wait --profile claude-code-2 /);

    expect((await resolveProfile('claude-code')).apiKey).toBe('key-old');
    expect((await resolveProfile('claude-code-2')).apiKey).toBe('key-new');
  });

  it('--profile picks the agent for send, wait and the rest; with none, the agent\'s own (old) profile is used', async () => {
    await saveProfile('claude-code', { apiUrl: 'https://api.example.test', apiKey: 'key-old' });
    await saveProfile('claude-code-2', { apiUrl: 'https://api.example.test', apiKey: 'key-new' });
    expect(await networkProfile('claude-code-2')).toBe('claude-code-2');
    expect(await networkProfile(undefined)).toBe('claude-code');
  });
});
