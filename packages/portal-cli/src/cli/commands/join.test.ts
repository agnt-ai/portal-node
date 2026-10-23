import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { agntJoin, pickUsername, guessProduct, randomSuffix, SUFFIX_ALPHABET } from './join.js';
import { AgntUsageError, describeError } from './agnt.js';
import { saveProfile, resolveProfile } from '../utils/credentials.js';
import { DEFAULT_ACCOUNT_NAME } from '../../defaults.js';

// The app's name as this build was hydrated with it (the bare token when not hydrated): never a fixed name.
const APP = DEFAULT_ACCOUNT_NAME;
const APP_RE = APP.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

vi.mock('../utils/credentials.js', () => ({
  saveProfile: vi.fn().mockResolvedValue(undefined),
  resolveProfileName: vi.fn().mockImplementation(async (name?: string) => name ?? 'default'),
  resolveProfile: vi.fn(),
}));

const ADDRESS = 'claude-code-7k3m9q2x@agent.example.test';

function answer(status: number, body: unknown) {
  return { ok: status < 400, status, headers: new Headers(), text: async () => JSON.stringify(body), json: async () => body };
}

const joined = (username: string) => ({
  ok: true, user: { id: 'u1', email: 'person@example.com', portalOnboarded: false }, apiKey: 'ak_live_secret', apiKeyId: 'k1',
  purpose: 'network', agnt: { address: `${username}@agent.example.test`, assistant: 'as1', pair: 'p1', custody: 'openassistant' },
});

describe('join defaults', () => {
  it('picks a username from the product with an 8-character suffix, within the rules', () => {
    expect(pickUsername('Claude Code', () => '7k3m9q2x')).toBe('claude-code-7k3m9q2x');
    expect(pickUsername('Codex', () => '7k3m9q2x')).toBe('codex-7k3m9q2x');
    expect(pickUsername('!!!', () => '7k3m9q2x')).toBe('agent-7k3m9q2x');
    const long = pickUsername('A very long product name that keeps going');
    expect(long.length).toBeLessThanOrEqual(28);
    expect(long).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*-[a-km-np-z2-9]{8}$/);
  });

  it('the suffix is 8 characters of a 32-letter alphabet with no look-alikes: 40 bits', () => {
    expect(SUFFIX_ALPHABET).toHaveLength(32);
    expect(new Set(SUFFIX_ALPHABET).size).toBe(32);
    expect(SUFFIX_ALPHABET).not.toMatch(/[lo01]/);
    // Every byte value maps into the alphabet, evenly.
    expect(randomSuffix(() => Uint8Array.from([0, 31, 32, 63, 64, 255, 128, 200]))).toBe('a9a9a9ai');
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const s = randomSuffix();
      expect(s).toMatch(/^[a-km-np-z2-9]{8}$/);
      seen.add(s);
    }
    expect(seen.size).toBe(2000);
  });

  it('guesses the product from the environment', () => {
    expect(guessProduct({ CLAUDECODE: '1' })).toBe('Claude Code');
    expect(guessProduct({ CODEX_HOME: '/x' })).toBe('Codex');
    expect(guessProduct({})).toBe('Agent');
  });
});

describe('agnt join', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    vi.mocked(saveProfile).mockClear();
    vi.mocked(resolveProfile).mockReset().mockRejectedValue(new Error('No profile'));
  });
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('needs the email the user chose for this agent: one they named, else ask; never their account or git email', async () => {
    await expect(agntJoin({})).rejects.toThrow(/each agent needs its own.*If they already named one for you, use it.*Never pick their account or git email on your own/);
    const err = await agntJoin({}).catch((e) => e);
    expect(err).toBeInstanceOf(AgntUsageError);
    const { body, exitCode } = describeError('join', err);
    expect(exitCode).toBe(2);
    expect(body.askUser).toMatch(/^I need to sign you up for a free .* account\. What's your email address\? Each of your agents needs its own/);
  });

  it('step 1 emails the code, never reads stdin, and says what to ask', async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer(200, { ok: true }));
    global.fetch = fetchMock as any;
    const stdinRead = vi.spyOn(process.stdin, 'read');
    const { result } = await agntJoin({ email: 'person@example.com', account: 'acme', apiUrl: 'https://api.example.test' }) as any;
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/portal/auth/agent/start');
    expect(stdinRead).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'code_sent', askUser: "I've emailed a code to person@example.com to confirm it's you. What is it?" });
    expect(result.findCode).toMatch(/inbox.*first.*verification email to person@example\.com sent after .*askUser/);
    expect(Date.parse(result.sentAt)).not.toBeNaN();
    // Every choice repeated, the API included, so step 2 signs up what step 1 meant.
    expect(result.next).toMatch(/agnt join --email person@example\.com --account acme --api-url https:\/\/api\.example\.test --code <the code>$/);
    expect(result.warning).toMatch(/sends your user's sign-in code to https:\/\/api\.example\.test, not the default API/);
  });

  it('step 1 repeats the chosen username and quotes what needs quoting', async () => {
    global.fetch = vi.fn().mockResolvedValue(answer(200, { ok: true })) as any;
    const { result } = await agntJoin({ email: 'person@example.com', account: 'acme', username: 'sally', displayName: 'Sally O\'Neil', profile: '-odd' }) as any;
    expect(result.next).toMatch(/ --username sally --display-name 'Sally O'\\''Neil' --profile=-odd --account acme --code <the code>$/);
    expect(result.warning).toBeUndefined();
  });

  it('refuses a plain-http API that is not on this computer, before sending anything', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as any;
    await expect(agntJoin({ email: 'person@example.com', account: 'acme', apiUrl: 'http://api.example.test' })).rejects.toThrow(/must be https/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // custody.keys is "custodial", or the app's slug from older servers: the same meaning, and never user text.
  it.each(['custodial', 'openassistant'])('once joined, only reports the address, read from the agent\'s own profile (custody %s)', async (keys) => {
    vi.mocked(resolveProfile).mockResolvedValue({ apiUrl: 'https://api.example.test', apiKey: 'ak' });
    vi.stubEnv('AGNT_CLI_PROFILE', '');
    vi.stubEnv('CODEX_HOME', '/x');
    vi.stubEnv('CLAUDECODE', '');
    vi.stubEnv('CLAUDE_CODE_ENTRYPOINT', '');
    global.fetch = vi.fn().mockResolvedValue(answer(200, { address: ADDRESS, pair: {}, custody: { keys, note: '' } })) as any;
    const { result } = await agntJoin({}) as any;
    vi.unstubAllEnvs();
    expect(resolveProfile).toHaveBeenCalledWith('codex');
    expect(result).toMatchObject({ status: 'already_joined', address: ADDRESS });
    expect(result.tellUser).toBe(`I'm all set. My ${APP} Network ID is ${ADDRESS}. Which agent do you want me to talk to?`);
    expect(result.tellUser).not.toContain(keys);
    expect(result.conversation).toMatch(/reply yourself.*--timeout 300.*3 timeouts in a row/);
  });

  it('a joined agent whose server is down is told so, never signed up again (that would orphan its Network ID)', async () => {
    vi.mocked(resolveProfile).mockResolvedValue({ apiUrl: 'https://api.example.test', apiKey: 'ak' });
    vi.stubEnv('AGNT_CLI_PROFILE', 'codex');
    const fetchMock = vi.fn().mockResolvedValue(answer(503, { status: 503, error_code: 'agnt_unavailable', error: 'busy' }));
    global.fetch = fetchMock as any;
    await expect(agntJoin({ email: 'person@example.com' })).rejects.toMatchObject({ status: 503 });
    vi.unstubAllEnvs();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/agnt\/whoami\??$/);
  });

  it('step 2 uses the defaults, tries another username when one is taken, and ends with the line to say', async () => {
    let tried: string[] = [];
    global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      tried.push(body.agent.username);
      if (tried.length === 1) return answer(409, { status: 409, error_code: 'agnt_username_taken', error: 'That username is taken; choose another' });
      return answer(201, joined(body.agent.username));
    }) as any;
    vi.stubEnv('CLAUDECODE', '1');
    const { result } = await agntJoin({ email: 'person@example.com', code: '123456', account: 'acme', apiUrl: 'https://api.example.test', timezone: 'Europe/Paris', json: true }) as any;
    vi.unstubAllEnvs();
    expect(tried).toHaveLength(2);
    expect(tried[0]).not.toBe(tried[1]);
    const body = JSON.parse((global.fetch as any).mock.calls[1][1].body);
    expect(body).toMatchObject({ purpose: 'network', timezone: 'Europe/Paris', code: '123456', agent: { displayName: 'Claude Code', product: 'Claude Code' } });
    expect(body.agent.username).toMatch(/^claude-code-[a-km-np-z2-9]{8}$/);
    // Saved under the agent's own profile, never the shared default.
    expect(saveProfile).toHaveBeenCalledWith('claude-code', { apiUrl: 'https://api.example.test', apiKey: 'ak_live_secret', apiKeyId: 'k1', account: 'acme' });
    expect(result.savedProfile).toBe('claude-code');
    expect(result.status).toBe('joined');
    expect(result.conversation).toMatch(/^When your person names an agent to talk to.*wait --timeout 0 until it exits 3/);
    expect(result.tellUser).toMatch(new RegExp(`^I signed you up for a free ${APP_RE} account with person@example\\.com and joined us to the ${APP_RE} Network, so other people's agents can reach me for you\\. My ${APP_RE} Network ID is ${tried[1]}@agent\\.example\\.test\\. Which agent do you want me to talk to\\?$`));
    expect(JSON.stringify(result)).not.toContain('ak_live_secret');
  });

  it('by default the result is short: status, Network ID, what to tell the user, how to talk, next', async () => {
    global.fetch = vi.fn().mockResolvedValue(answer(201, joined('codex-7k3m9q2x'))) as any;
    const { result } = await agntJoin({ email: 'person@example.com', code: '1', account: 'acme', username: 'codex-7k3m9q2x' }) as any;
    expect(Object.keys(result).sort()).toEqual(['address', 'conversation', 'next', 'status', 'tellUser']);
    expect(JSON.stringify(result)).not.toMatch(/apiKeyId|toFill|"user"|ak_live/);
  });

  it('a network join says "free account" in Paul\'s words, never "full account", at any step', async () => {
    const said: string[] = [];
    said.push(describeError('join', await agntJoin({}).catch((e) => e)).body.askUser!);
    global.fetch = vi.fn().mockResolvedValueOnce(answer(200, { ok: true })).mockResolvedValueOnce(answer(201, joined('codex-7k3m9q2x'))) as any;
    said.push(JSON.stringify((await agntJoin({ email: 'person@example.com', account: 'acme' }) as any).result));
    said.push(JSON.stringify((await agntJoin({ email: 'person@example.com', code: '1', account: 'acme', username: 'codex-7k3m9q2x' }) as any).result));
    for (const text of said) expect(text).not.toMatch(/full account/i);
    expect(said[0]).toMatch(new RegExp(`^I need to sign you up for a free ${APP_RE} account\\. What's your email address\\?`));
    expect(said[2]).toMatch(new RegExp(`I signed you up for a free ${APP_RE} account with person@example\\.com and joined us to the ${APP_RE} Network`));

    global.fetch = vi.fn().mockResolvedValue(answer(201, { ...joined('codex-7k3m9q2x'), purpose: 'account' })) as any;
    const { result } = await agntJoin({ email: 'person@example.com', code: '1', account: 'acme', username: 'codex-7k3m9q2x', purpose: 'account' }) as any;
    expect(result.tellUser).toMatch(new RegExp(`^I signed you up for a free ${APP_RE} account with person@example\\.com\\. I'm all set\\. My ${APP_RE} Network ID is `));
    expect(describeError('join', await agntJoin({ purpose: 'account' }).catch((e) => e)).body.askUser).toMatch(/^I need to sign you up for a free .* account\./);
  });

  it('a name lost after the code was used: no retry, and the hint says to get a new code from the user', async () => {
    global.fetch = vi.fn().mockResolvedValue(answer(409, {
      status: 409, error_code: 'agnt_username_taken', error: 'That username was just taken; choose another and request a new code',
    })) as any;
    const err = await agntJoin({ email: 'person@example.com', code: '1', account: 'acme' }).catch((e) => e);
    expect((global.fetch as any).mock.calls).toHaveLength(1);
    expect(describeError('join', err).body.hint).toMatch(/without --code.*ask your user/);
  });

  it('agnt_not_enabled is not retried with another name, and says what to tell the user', async () => {
    global.fetch = vi.fn().mockResolvedValue(answer(400, {
      status: 400, error_code: 'agnt_not_enabled', error: 'Agent sign-up is not enabled for this app; nothing was created and your code still works.',
    })) as any;
    const err = await agntJoin({ email: 'person@example.com', code: '42', account: 'acme' }).catch((e) => e);
    expect((global.fetch as any).mock.calls).toHaveLength(1);
    const { body, exitCode } = describeError('join', err);
    expect(exitCode).toBe(1);
    expect(body.code).toBe('agnt_not_enabled');
    expect(body.hint).toBe(`The ${APP} Network isn't turned on for this app yet; only its operator can turn it on. Stop and tell your user; nothing you run can fix it.`);
  });

  it('a wrong code is not retried with another name', async () => {
    global.fetch = vi.fn().mockResolvedValue(answer(400, { status: 400, error_code: 'otp_invalid', error: 'Incorrect code.' })) as any;
    const err = await agntJoin({ email: 'person@example.com', code: '1', account: 'acme' }).catch((e) => e);
    expect((global.fetch as any).mock.calls).toHaveLength(1);
    expect(describeError('join', err).body.hint).toMatch(/Ask your user/);
  });
});
