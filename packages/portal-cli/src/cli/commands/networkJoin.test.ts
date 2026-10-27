import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { networkJoin, pickUsername, guessProduct, randomSuffix, SUFFIX_ALPHABET, usernameOf } from './networkJoin.js';
import { NetworkUsageError, describeError } from './network.js';
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
  purpose: 'network', agnt: { address: `${username}@agent.example.test`, assistant: 'as1', pair: 'p1', custody: 'custodial' },
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

describe('network join', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    vi.mocked(saveProfile).mockClear();
    vi.mocked(resolveProfile).mockReset().mockRejectedValue(new Error('No profile'));
  });
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('needs the email the user chose for this agent: one they named, else ask; never their account or git email', async () => {
    await expect(networkJoin({})).rejects.toThrow(/each agent needs its own.*If they already named one for you, use it.*Never pick their account or git email on your own/);
    const err = await networkJoin({}).catch((e) => e);
    expect(err).toBeInstanceOf(NetworkUsageError);
    const { body, exitCode } = describeError('join', err);
    expect(exitCode).toBe(2);
    expect(body.askUser).toMatch(/^I need to sign you up for a free .* account\. What's your email address\? Each of your agents needs its own/);
  });

  it('step 1 emails the code, never reads stdin, and says what to ask', async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer(200, { ok: true }));
    global.fetch = fetchMock as any;
    const stdinRead = vi.spyOn(process.stdin, 'read');
    const { result } = await networkJoin({ email: 'person@example.com', account: 'acme', apiUrl: 'https://api.example.test' }) as any;
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/portal/auth/agent/start');
    expect(stdinRead).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'code_sent', askUser: "I've emailed a code to person@example.com to confirm it's you. What is it?" });
    expect(result.findCode).toMatch(/inbox.*first.*verification email to person@example\.com sent after .*askUser/);
    expect(Date.parse(result.sentAt)).not.toBeNaN();
    // Every choice repeated, the API included, so step 2 signs up what step 1 meant.
    expect(result.next).toMatch(/network join --email person@example\.com --account acme --api-url https:\/\/api\.example\.test --username <the username your person confirmed> --code <the code>$/);
    // The agent is told to choose a username and get its person's yes before it registers.
    expect(result.chooseUsername).toMatch(/fun and memorable.*jerrylovesicecream.*"I'd like the username <it>, OK\?".*Only after they say yes.*bare first name such as john.*refused/);
    expect(result.warning).toMatch(/sends your user's sign-in code to https:\/\/api\.example\.test, not the default API/);
  });

  it('step 1 repeats the chosen username and quotes what needs quoting', async () => {
    global.fetch = vi.fn().mockResolvedValue(answer(200, { ok: true })) as any;
    const { result } = await networkJoin({ email: 'person@example.com', account: 'acme', username: 'sally', displayName: 'Sally O\'Neil', profile: '-odd' }) as any;
    expect(result.next).toMatch(/ --username sally --display-name 'Sally O'\\''Neil' --profile=-odd --account acme --code <the code>$/);
    expect(result.warning).toBeUndefined();
  });

  it('refuses a plain-http API that is not on this computer, before sending anything', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as any;
    await expect(networkJoin({ email: 'person@example.com', account: 'acme', apiUrl: 'http://api.example.test' })).rejects.toThrow(/must be https/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // custody.keys is "custodial", or the app's slug from older servers: the same meaning, and never user text.
  it.each(['custodial', 'example-app'])('once joined, only reports the address, read from the agent\'s own profile (custody %s)', async (keys) => {
    vi.mocked(resolveProfile).mockResolvedValue({ apiUrl: 'https://api.example.test', apiKey: 'ak' });
    vi.stubEnv('AGNT_CLI_PROFILE', '');
    vi.stubEnv('CODEX_HOME', '/x');
    vi.stubEnv('CLAUDECODE', '');
    vi.stubEnv('CLAUDE_CODE_ENTRYPOINT', '');
    global.fetch = vi.fn().mockResolvedValue(answer(200, { address: ADDRESS, pair: {}, custody: { keys, note: '' } })) as any;
    const { result } = await networkJoin({}) as any;
    vi.unstubAllEnvs();
    expect(resolveProfile).toHaveBeenCalledWith('codex');
    expect(result).toMatchObject({ status: 'already_joined', address: ADDRESS });
    expect(result.tellUser).toBe(`I'm all set. My ${APP} Network username is claude-code-7k3m9q2x. Which agent do you want me to talk to?`);
    expect(result.username).toBe('claude-code-7k3m9q2x');
    expect(result.tellUser).not.toContain(keys);
    expect(result.conversation).toMatch(/reply yourself.*--timeout 300.*3 timeouts in a row/);
    expect(result.stayReachable).toMatch(/network webhook set.*network watch --print/);
  });

  it('a joined agent whose server is down is told so, never signed up again (that would orphan its Network ID)', async () => {
    vi.mocked(resolveProfile).mockResolvedValue({ apiUrl: 'https://api.example.test', apiKey: 'ak' });
    vi.stubEnv('AGNT_CLI_PROFILE', 'codex');
    const fetchMock = vi.fn().mockResolvedValue(answer(503, { status: 503, error_code: 'agnt_unavailable', error: 'busy' }));
    global.fetch = fetchMock as any;
    await expect(networkJoin({ email: 'person@example.com' })).rejects.toMatchObject({ status: 503 });
    vi.unstubAllEnvs();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/agnt\/whoami\??$/);
  });

  it('step 2 with --random-username uses the defaults, tries another when one is taken, and ends with the line to say', async () => {
    let tried: string[] = [];
    global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      tried.push(body.agent.username);
      if (tried.length === 1) return answer(409, { status: 409, error_code: 'agnt_username_taken', error: 'That username is taken; choose another' });
      return answer(201, joined(body.agent.username));
    }) as any;
    vi.stubEnv('CLAUDECODE', '1');
    const { result } = await networkJoin({ email: 'person@example.com', code: '123456', account: 'acme', apiUrl: 'https://api.example.test', timezone: 'Europe/Paris', json: true, randomUsername: true }) as any;
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
    expect(result.tellUser).toMatch(new RegExp(`^I signed you up for a free ${APP_RE} account with person@example\\.com and joined the ${APP_RE} Network, so other people's agents can reach me for you\\. My ${APP_RE} Network username is ${tried[1]}\\. Which agent do you want me to talk to\\?$`));
    expect(JSON.stringify(result)).not.toContain('ak_live_secret');
  });

  // Agent sign-up is the contract below: POST /portal/auth/agent/start {email, account}, then
  // POST /portal/auth/agent/verify {email, account, code, label, purpose, timezone, agent{username, displayName, product}}.
  it('follows the agent sign-up contract: the two routes, no auth, and exactly the fields it names', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(answer(200, { ok: true }))
      .mockResolvedValueOnce(answer(201, joined('codex-7k3m9q2x')));
    global.fetch = fetchMock as any;
    await networkJoin({ email: 'person@example.com', account: 'acme', apiUrl: 'https://api.example.test' });
    await networkJoin({ email: 'person@example.com', code: '1', account: 'acme', apiUrl: 'https://api.example.test', username: 'codex-7k3m9q2x', product: 'Codex', timezone: 'Europe/Paris' });
    const [start, verify] = fetchMock.mock.calls;
    expect(start[0]).toBe('https://api.example.test/portal/auth/agent/start');
    expect(JSON.parse(start[1].body)).toEqual({ email: 'person@example.com', account: 'acme' });
    expect(verify[0]).toBe('https://api.example.test/portal/auth/agent/verify');
    expect(JSON.parse(verify[1].body)).toEqual({
      email: 'person@example.com', account: 'acme', code: '1', label: 'Codex', purpose: 'network', timezone: 'Europe/Paris',
      agent: { username: 'codex-7k3m9q2x', displayName: 'Codex', product: 'Codex' },
    });
    for (const [, init] of fetchMock.mock.calls) expect(JSON.stringify(init.headers ?? {})).not.toMatch(/authorization/i);
  });

  it('the key label is the product, or the one given: never this computer\'s name', async () => {
    const { hostname } = await import('node:os');
    const fetchMock = vi.fn().mockResolvedValue(answer(201, joined('codex-7k3m9q2x')));
    global.fetch = fetchMock as any;
    await networkJoin({ email: 'person@example.com', code: '1', account: 'acme', username: 'codex-7k3m9q2x', product: 'Codex' });
    await networkJoin({ email: 'person@example.com', code: '1', account: 'acme', username: 'codex-7k3m9q2x', product: 'Codex', label: 'Work laptop' });
    const labels = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).label);
    expect(labels).toEqual(['Codex', 'Work laptop']);
    for (const [, init] of fetchMock.mock.calls) expect(init.body).not.toContain(hostname());
  });

  it('next suggests importing LinkedIn connections, always on the profile join saved', async () => {
    global.fetch = vi.fn().mockResolvedValue(answer(201, joined('claude-code-7k3m9q2x'))) as any;
    vi.stubEnv('CLAUDECODE', '1');
    const { result } = await networkJoin({ email: 'person@example.com', code: '1', account: 'acme', username: 'claude-code-7k3m9q2x' }) as any;
    vi.unstubAllEnvs();
    // Commands outside network fall back to the default profile, so the import names the agent's own one.
    expect(result.next).toContainEqual(expect.stringMatching(/ contacts import-linkedin --profile claude-code <your person's LinkedIn Connections\.csv>$/));
    expect(result.next.at(-1)).toMatch(/ agent-guide$/);

    const { result: odd } = await networkJoin({ email: 'person@example.com', code: '1', account: 'acme', username: 'claude-code-7k3m9q2x', profile: '-odd' }) as any;
    expect(odd.next).toContainEqual(expect.stringMatching(/ contacts import-linkedin --profile=-odd <your person's LinkedIn Connections\.csv>$/));
  });

  it('by default the result is short: status, Network ID, what to tell the user, how to talk, next', async () => {
    global.fetch = vi.fn().mockResolvedValue(answer(201, joined('codex-7k3m9q2x'))) as any;
    const { result } = await networkJoin({ email: 'person@example.com', code: '1', account: 'acme', username: 'codex-7k3m9q2x' }) as any;
    expect(Object.keys(result).sort()).toEqual(['address', 'conversation', 'next', 'status', 'stayReachable', 'tellUser', 'username']);
    // To the person it is the username, never the domain; the agent keeps the full address.
    expect(result.tellUser).toContain('Network username is codex-7k3m9q2x.');
    expect(result.tellUser).not.toContain('@agent.example.test');
    expect(JSON.stringify(result)).not.toMatch(/apiKeyId|toFill|"user"|ak_live/);
  });

  it('a network join says "free account", never "full account", at any step', async () => {
    const said: string[] = [];
    said.push(describeError('join', await networkJoin({}).catch((e) => e)).body.askUser!);
    global.fetch = vi.fn().mockResolvedValueOnce(answer(200, { ok: true })).mockResolvedValueOnce(answer(201, joined('codex-7k3m9q2x'))) as any;
    said.push(JSON.stringify((await networkJoin({ email: 'person@example.com', account: 'acme' }) as any).result));
    said.push(JSON.stringify((await networkJoin({ email: 'person@example.com', code: '1', account: 'acme', username: 'codex-7k3m9q2x' }) as any).result));
    for (const text of said) expect(text).not.toMatch(/full account/i);
    expect(said[0]).toMatch(new RegExp(`^I need to sign you up for a free ${APP_RE} account\\. What's your email address\\?`));
    expect(said[2]).toMatch(new RegExp(`I signed you up for a free ${APP_RE} account with person@example\\.com and joined the ${APP_RE} Network`));

    global.fetch = vi.fn().mockResolvedValue(answer(201, { ...joined('codex-7k3m9q2x'), purpose: 'account' })) as any;
    const { result } = await networkJoin({ email: 'person@example.com', code: '1', account: 'acme', username: 'codex-7k3m9q2x', purpose: 'account' }) as any;
    expect(result.tellUser).toMatch(new RegExp(`^I signed you up for a free ${APP_RE} account with person@example\\.com\\. I'm all set\\. My ${APP_RE} Network username is `));
    expect(describeError('join', await networkJoin({ purpose: 'account' }).catch((e) => e)).body.askUser).toMatch(/^I need to sign you up for a free .* account\./);
  });

  it('a name lost after the code was used: no retry, and the hint says to get a new code from the user', async () => {
    global.fetch = vi.fn().mockResolvedValue(answer(409, {
      status: 409, error_code: 'agnt_username_taken', error: 'That username was just taken; choose another and request a new code',
    })) as any;
    const err = await networkJoin({ email: 'person@example.com', code: '1', account: 'acme', username: 'sunny-side' }).catch((e) => e);
    expect((global.fetch as any).mock.calls).toHaveLength(1);
    expect(describeError('join', err).body.hint).toMatch(/without --code.*ask your user/);
  });

  it('agnt_not_enabled is not retried with another name, and says what to tell the user', async () => {
    global.fetch = vi.fn().mockResolvedValue(answer(400, {
      status: 400, error_code: 'agnt_not_enabled', error: 'Agent sign-up is not enabled for this app; nothing was created and your code still works.',
    })) as any;
    const err = await networkJoin({ email: 'person@example.com', code: '42', account: 'acme', username: 'sunny-side' }).catch((e) => e);
    expect((global.fetch as any).mock.calls).toHaveLength(1);
    const { body, exitCode } = describeError('join', err);
    expect(exitCode).toBe(1);
    expect(body.code).toBe('agnt_not_enabled');
    expect(body.hint).toBe(`The ${APP} Network isn't turned on for this app yet; only its operator can turn it on. Stop and tell your user; nothing you run can fix it.`);
  });

  it('a wrong code is not retried with another name', async () => {
    global.fetch = vi.fn().mockResolvedValue(answer(400, { status: 400, error_code: 'otp_invalid', error: 'Incorrect code.' })) as any;
    const err = await networkJoin({ email: 'person@example.com', code: '1', account: 'acme', username: 'sunny-side' }).catch((e) => e);
    expect((global.fetch as any).mock.calls).toHaveLength(1);
    expect(describeError('join', err).body.hint).toMatch(/Ask your user/);
  });
  it('step 2 will not run without a username the person confirmed: nothing is sent, the code is not used up', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as any;
    const err = await networkJoin({ email: 'person@example.com', code: '123456', account: 'acme' }).catch((e) => e);
    expect(err).toBeInstanceOf(NetworkUsageError);
    expect(fetchMock).not.toHaveBeenCalled();
    const { body, exitCode } = describeError('join', err);
    expect(exitCode).toBe(2);
    expect(body.message).toMatch(/Give --username: the username your person confirmed.*"I'd like the username <it>, OK\?".*the code still works.*--random-username/);
    await expect(networkJoin({ email: 'person@example.com', code: '1', account: 'acme', username: 'a-b', randomUsername: true })).rejects.toThrow(/not both/);
  });

  it('registers exactly the username the person confirmed, and says it without the domain', async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer(201, joined('jerrylovesicecream')));
    global.fetch = fetchMock as any;
    const { result } = await networkJoin({ email: 'person@example.com', code: '1', account: 'acme', username: ' jerrylovesicecream ' }) as any;
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).agent.username).toBe('jerrylovesicecream');
    expect(result).toMatchObject({ address: 'jerrylovesicecream@agent.example.test', username: 'jerrylovesicecream' });
    expect(result.tellUser).toMatch(/My .* Network username is jerrylovesicecream\. Which agent/);
    expect(usernameOf('a-b@x.example')).toBe('a-b');
  });

  it('a username that is taken or reserved is never swapped for a random one: the agent is told to ask its person again', async () => {
    for (const [status, code, error, hint] of [
      [409, 'agnt_username_taken', 'That username is taken; choose another', /taken.*the code still works: propose a different one to your person.*--random-username/],
      [400, 'agnt_username_reserved', 'That username is a first name, which we keep for the network\'s own assistants. Pick something longer or more distinctive', /reserved.*propose a longer or more distinctive one to your person.*--random-username/],
    ] as const) {
      const fetchMock = vi.fn().mockResolvedValue(answer(status, { status, error_code: code, error }));
      global.fetch = fetchMock as any;
      const err = await networkJoin({ email: 'person@example.com', code: '1', account: 'acme', username: 'john' }).catch((e) => e);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(describeError('join', err).body.hint).toMatch(hint);
    }
  });

  it('--random-username is the fallback: a reserved or taken random name is retried with another', async () => {
    const tried: string[] = [];
    global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      const username = JSON.parse(init.body).agent.username;
      tried.push(username);
      if (tried.length === 1) return answer(400, { status: 400, error_code: 'agnt_username_reserved', error: 'That username is reserved; choose another' });
      return answer(201, joined(username));
    }) as any;
    const { result } = await networkJoin({ email: 'person@example.com', code: '1', account: 'acme', product: 'Codex', randomUsername: true }) as any;
    expect(tried).toHaveLength(2);
    expect(tried[1]).toMatch(/^codex-[a-km-np-z2-9]{8}$/);
    expect(result.status).toBe('joined');
    // Step 1 keeps the choice for step 2.
    global.fetch = vi.fn().mockResolvedValue(answer(200, { ok: true })) as any;
    const step1 = await networkJoin({ email: 'person@example.com', account: 'acme', randomUsername: true }) as any;
    expect(step1.result.next).toMatch(/ --random-username --code <the code>$/);
    expect(step1.result.chooseUsername).toBeUndefined();
  });
});
