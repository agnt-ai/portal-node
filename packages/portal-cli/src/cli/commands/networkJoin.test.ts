import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { networkJoin, pickUsername, guessProduct, randomSuffix, SUFFIX_ALPHABET, usernameOf, defaultUsername, IDENTITY_ASK } from './networkJoin.js';
import { NetworkUsageError, describeError } from './network.js';
import { saveProfile, resolveProfile, pendingKeyRequest, setPendingKeyRequest } from '../utils/credentials.js';
import { DEFAULT_ACCOUNT_NAME } from '../../defaults.js';
import { builtInFirstCard, builtInTellUser } from '../utils/firstCard.js';
import { NETWORK_CORE } from '../networkCore.js';

// The app's name as this build was hydrated with it (the bare token when not hydrated): never a fixed name.
const APP = DEFAULT_ACCOUNT_NAME;
const APP_RE = APP.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

vi.mock('../utils/credentials.js', () => ({
  saveProfile: vi.fn().mockResolvedValue(undefined),
  resolveProfileName: vi.fn().mockImplementation(async (name?: string) => name ?? 'default'),
  resolveProfile: vi.fn(),
  pendingKeyRequest: vi.fn().mockResolvedValue(undefined),
  setPendingKeyRequest: vi.fn().mockResolvedValue(undefined),
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
    vi.mocked(pendingKeyRequest).mockReset().mockResolvedValue(undefined);
    vi.mocked(setPendingKeyRequest).mockClear();
  });
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('needs the person\'s email: one the agent already knows, used without asking, else ask; never a guessed one', async () => {
    await expect(networkJoin({})).rejects.toThrow(/If you already know it \(they told you, or it is the account you work in\), use it without asking; only if you do not, ask them with "askUser"\. Never guess one \(not a git config email, not one another of their agents uses\)/);
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
    expect(result.findCode).toMatch(/^Asking your user for the code is the default\..*inbox.*verification email to person@example\.com sent after .*askUser/);
    expect(Date.parse(result.sentAt)).not.toBeNaN();
    // Every choice repeated, the API included, so step 2 signs up what step 1 meant.
    expect(result.next).toMatch(/network join --email person@example\.com --account acme --api-url https:\/\/api\.example\.test --code <the code>$/);
    // No name to pick: step 1 says the default it will take, and how to pick another.
    expect(result).toMatchObject({ username: 'person-agent' });
    expect(result.nameNote).toMatch(/^You will join as person-agent .*add --name <short name> to the next command/);
    expect(result).not.toHaveProperty('chooseUsername');
    expect(result.warning).toMatch(/sends your user's sign-in code to https:\/\/api\.example\.test, not the default API/);
  });

  it('says who it is: step 1 asks for a name and product when either is missing, and the finish command carries what was given', async () => {
    global.fetch = vi.fn().mockResolvedValue(answer(200, { ok: true })) as any;
    const asked = (await networkJoin({ email: 'person@example.com', account: 'acme' }) as any).result;
    expect(asked.identityNote).toBe(IDENTITY_ASK);
    expect(asked.identityNote).toMatch(/--display-name <your name> --product <what you run on>/);
    const told = (await networkJoin({ email: 'person@example.com', account: 'acme', displayName: 'Groklet', product: 'Grok' }) as any).result;
    expect(told.identityNote).toBeUndefined();
    expect(told.next).toMatch(/ --display-name Groklet --product Grok /);
  });

  it('sends the name and product the agent gave; left out, the product is guessed and the answer says so, after tellUser and before the card', async () => {
    vi.stubEnv('CLAUDECODE', '');
    vi.stubEnv('CLAUDE_CODE_ENTRYPOINT', '');
    vi.stubEnv('CURSOR_TRACE_ID', 'x');
    const fetchMock = vi.fn().mockResolvedValue(answer(201, joined('stavros-agent')));
    global.fetch = fetchMock as any;
    const told = await networkJoin({ email: 'stavros@example.com', code: '1', account: 'acme', displayName: 'Groklet', product: 'Grok' }) as any;
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).agent).toMatchObject({ displayName: 'Groklet', product: 'Grok' });
    expect(told.result.identity).toBeUndefined();
    const guessed = await networkJoin({ email: 'stavros@example.com', code: '1', account: 'acme' }) as any;
    vi.unstubAllEnvs();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).agent).toMatchObject({ displayName: 'Cursor', product: 'Cursor' });
    expect(Object.keys(guessed.result)).toEqual(['status', 'address', 'username', 'next', 'tellUser', 'identity', 'orientation']);
    expect(guessed.result.identity).toMatchObject({ displayName: 'Cursor', product: 'Cursor', productGuessed: true, displayNameGiven: false });
    expect(guessed.result.identity.fix).toMatch(/^Your person sees you as Cursor \(Cursor: guessed from this environment, not said by you\)\. If that is not who you are, set it now: \S+ network profile --display-name <your name> --product <what you run on>\.$/);
    expect(guessed.notice).toMatch(/"identity" says who your person sees you as, and how to correct it\.$/);
  });

  it('step 1 repeats the chosen username and quotes what needs quoting', async () => {
    global.fetch = vi.fn().mockResolvedValue(answer(200, { ok: true })) as any;
    const { result } = await networkJoin({ email: 'person@example.com', account: 'acme', name: 'sally', displayName: 'Sally O\'Neil', profile: '-odd' }) as any;
    expect(result.username).toBe('sally');
    expect(result.next).toMatch(/ --name sally --display-name 'Sally O'\\''Neil' --profile=-odd --account acme --code <the code>$/);
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
    // The same short answer as a fresh join: the steps, what to tell the person, the card.
    expect(Object.keys(result)).toEqual(['status', 'address', 'username', 'next', 'tellUser', 'orientation']);
    expect(result.tellUser).toBe(builtInTellUser({ address: ADDRESS }));
    expect(result.next).toBe(builtInFirstCard());
    expect(result.username).toBe('claude-code-7k3m9q2x');
    expect(result.tellUser).not.toContain(keys);
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
    expect(result.tellUser).toBe(builtInTellUser({ email: 'person@example.com', address: `${tried[1]}@agent.example.test` }));
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
      keyApproval: true,
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

  it('by default the result is short and leads with what to do: the steps, then what to tell the person, then the card', async () => {
    global.fetch = vi.fn().mockResolvedValue(answer(201, joined('codex-7k3m9q2x'))) as any;
    const { result, notice } = await networkJoin({ email: 'person@example.com', code: '1', account: 'acme', username: 'codex-7k3m9q2x', displayName: 'Codex', product: 'Codex' }) as any;
    expect(Object.keys(result)).toEqual(['status', 'address', 'username', 'next', 'tellUser', 'orientation']);
    expect(result.next).toBe(builtInFirstCard());
    expect(result.next).toMatch(/1\. Ask your person, once, how they want you to use this network.*\n2\. Give your person's name once, so other agents find them by it.*Only with their OK, publish the profile line they approved.*\n3\. Check your inbox once now.*\n4\. Run the self-test with what they chose: `\S+ network doctor --scheduled`.*`\S+ network doctor --when-asked`/);
    // tellUser covers what the card asks the agent to say, as the person chose: its line, how often it checks, what it does alone.
    for (const point of ['with person@example.com', 'your Network ID is codex-7k3m9q2x@agent.example.test,', 'what your profile line says, if you published one', 'every 15 minutes',
      'or that you only check when they ask you to', 'what you will do on your own and what you will ask them first, as they chose', 'Then ask whom you should message']) expect(result.tellUser).toContain(point);
    expect(result.tellUser).not.toMatch(/OK once/);
    // The plain line on stderr points at the answer; it never prints its text a second time.
    expect(notice).toBe('joined as codex-7k3m9q2x@agent.example.test. Do the numbered steps in "next", in order, then tell your person what "tellUser" describes. "orientation" says how the network works.');
    expect(JSON.stringify(result)).not.toMatch(/apiKeyId|toFill|"user"|ak_live/);
  });

  it('a profile chosen by hand is named in the notice, since bare commands would not find it', async () => {
    global.fetch = vi.fn().mockResolvedValue(answer(201, joined('codex-7k3m9q2x'))) as any;
    const { notice } = await networkJoin({ email: 'person@example.com', code: '1', account: 'acme', username: 'codex-7k3m9q2x', profile: '-odd' }) as any;
    expect(notice).toMatch(/ Add --profile=-odd to every command you run\.$/);
  });

  it('prints the server\'s card and tellUser when the sign-up answer carries them, else the built-in copies', async () => {
    const serverCard = 'These four steps are required before you count as set up, not advice:\n1. Set your line.\n\nThen tell your person what `tellUser` describes.';
    global.fetch = vi.fn().mockResolvedValue(answer(201, { ...joined('codex-7k3m9q2x'), nextSteps: serverCard, tellUser: '  Tell them what the server says.  ' })) as any;
    const fromServer = await networkJoin({ email: 'person@example.com', code: '1', account: 'acme', username: 'codex-7k3m9q2x' }) as any;
    expect(fromServer.result.next).toBe(serverCard);
    expect(fromServer.result.tellUser).toBe('Tell them what the server says.');

    // A server whose nextSteps has no card keeps its text and gets the built-in four steps after it.
    global.fetch = vi.fn().mockResolvedValue(answer(201, { ...joined('codex-7k3m9q2x'), nextSteps: 'Tell your person you joined.' })) as any;
    const older = await networkJoin({ email: 'person@example.com', code: '1', account: 'acme', username: 'codex-7k3m9q2x' }) as any;
    expect(older.result.next).toBe(`Tell your person you joined.\n\n${builtInFirstCard()}`);
    expect(older.result.tellUser).toBe(builtInTellUser({ email: 'person@example.com', address: 'codex-7k3m9q2x@agent.example.test' }));
  });

  it('a network join never says "full account", at any step', async () => {
    const said: string[] = [];
    said.push(describeError('join', await networkJoin({}).catch((e) => e)).body.askUser!);
    global.fetch = vi.fn().mockResolvedValueOnce(answer(200, { ok: true })).mockResolvedValueOnce(answer(201, joined('codex-7k3m9q2x'))) as any;
    said.push(JSON.stringify((await networkJoin({ email: 'person@example.com', account: 'acme' }) as any).result));
    said.push(JSON.stringify((await networkJoin({ email: 'person@example.com', code: '1', account: 'acme', username: 'codex-7k3m9q2x' }) as any).result));
    for (const text of said) expect(text).not.toMatch(/full account/i);
    expect(said[0]).toMatch(new RegExp(`^I need to sign you up for a free ${APP_RE} account\\. What's your email address\\?`));
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
  it('step 2 without a name joins as the email\'s first part plus "-agent", and a free name like it when that is taken', async () => {
    const tried: string[] = [];
    global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      const username = JSON.parse(init.body).agent.username;
      tried.push(username);
      if (tried.length === 1) return answer(409, { status: 409, error_code: 'agnt_username_taken', error: 'That username is taken; choose another' });
      return answer(201, joined(username));
    }) as any;
    const { result } = await networkJoin({ email: 'Dana.Lee+work@example.com', code: '1', account: 'acme' }) as any;
    expect(tried[0]).toBe('dana-lee-work-agent');
    expect(tried[1]).toMatch(/^dana-lee-work-agent-[a-z2-9]{8}$/);
    expect(result.username).toBe(tried[1]);
    await expect(networkJoin({ email: 'person@example.com', code: '1', account: 'acme', name: 'a-b', randomUsername: true })).rejects.toThrow(/not both/);
  });

  it('defaultUsername keeps to the username alphabet and 28 characters', () => {
    expect(defaultUsername('dana@example.com')).toBe('dana-agent');
    expect(defaultUsername('Ünïcode__Name..x@example.com')).toBe('n-code-name-x-agent');
    expect(defaultUsername(`${'a'.repeat(40)}@example.com`)).toBe(`${'a'.repeat(22)}-agent`);
    expect(defaultUsername('---@example.com')).toBe('my-agent');
    for (const e of ['dana@example.com', `${'ab-'.repeat(20)}@x.com`]) expect(defaultUsername(e)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(defaultUsername(`${'ab-'.repeat(20)}@x.com`).length).toBeLessThanOrEqual(28);
  });

  it('registers exactly the username the person confirmed, and says the full Network ID', async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer(201, joined('jerrylovesicecream')));
    global.fetch = fetchMock as any;
    const { result } = await networkJoin({ email: 'person@example.com', code: '1', account: 'acme', username: ' jerrylovesicecream ' }) as any;
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).agent.username).toBe('jerrylovesicecream');
    expect(result).toMatchObject({ address: 'jerrylovesicecream@agent.example.test', username: 'jerrylovesicecream' });
    // The full Network ID (2026-11-16): it is what another person's agent needs to reach this one.
    expect(result.tellUser).toContain('your Network ID is jerrylovesicecream@agent.example.test, where other agents can message you');
    expect(usernameOf('a-b@x.example')).toBe('a-b');
  });

  it('a name given with --name that is taken or reserved is never swapped for another: join says so, the code still works', async () => {
    for (const [status, code, error, hint] of [
      [409, 'agnt_username_taken', 'That username is taken; choose another', /taken.*the code still works: run the same join command with another --name, or without --name/],
      [400, 'agnt_username_reserved', 'That username is a first name, which we keep for the network\'s own assistants. Pick something longer or more distinctive', /reserved.*with a longer --name.*or without --name/],
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

describe('orientation', () => {
  it('keeps the card in the join answer: the server\'s own when the sign-up answer carries one, else the built-in text', async () => {
    global.fetch = vi.fn().mockResolvedValue(answer(201, { ...joined('codex-7k3m9q2x'), orientation: '  Server orientation.  ' })) as any;
    const fromServer = await networkJoin({ email: 'person@example.com', code: '1', account: 'acme', username: 'codex-7k3m9q2x' }) as any;
    expect(fromServer.result.orientation).toBe('Server orientation.');
    // The card is last: what to do comes first.
    expect(Object.keys(fromServer.result).at(-1)).toBe('orientation');
    expect(fromServer.notice).not.toContain('Server orientation.');

    for (const none of [undefined, '', '   ', 7]) {
      global.fetch = vi.fn().mockResolvedValue(answer(201, { ...joined('codex-7k3m9q2x'), orientation: none })) as any;
      const builtIn = await networkJoin({ email: 'person@example.com', code: '1', account: 'acme', username: 'codex-7k3m9q2x' }) as any;
      expect(builtIn.result.orientation).toBe(NETWORK_CORE);
    }
  });

  describe('an address that already has a working key (G455)', () => {
    const pendingAnswer = {
      ok: true, status: 'approval_pending', agnt: { address: ADDRESS, custody: 'custodial' },
      keyRequest: { id: 'kr1', claimSecret: 'claim-secret-sample', expiresAt: '2026-11-17T12:00:00.000Z' },
      tellUser: 'I asked for a new key. Please approve it in the app.',
    };
    const stored = { apiUrl: 'https://api.example.test', account: 'acme', id: 'kr1', claimSecret: 'claim-secret-sample', address: ADDRESS, expiresAt: '2026-11-17T12:00:00.000Z' };
    const originalFetch = global.fetch;
    beforeEach(() => {
      vi.mocked(saveProfile).mockClear();
      vi.mocked(resolveProfile).mockReset().mockRejectedValue(new Error('No profile'));
      vi.mocked(pendingKeyRequest).mockReset().mockResolvedValue(undefined);
      vi.mocked(setPendingKeyRequest).mockClear();
    });
    afterEach(() => { global.fetch = originalFetch; });

    it('a 202 approval_pending saves no key over the profile; it keeps the claim for later and says what to tell the person', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce(answer(202, pendingAnswer)) as any;
      const out = await networkJoin({ email: 'person@example.com', code: '1', account: 'acme', apiUrl: 'https://api.example.test', username: 'claude-code-7k3m9q2x', profile: 'claude-code' });
      expect(saveProfile).not.toHaveBeenCalled();
      expect(setPendingKeyRequest).toHaveBeenCalledWith('claude-code', stored);
      expect(out.exitCode).toBe(75);
      expect(out.result).toMatchObject({ status: 'approval_pending', address: ADDRESS, tellUser: pendingAnswer.tellUser });
      expect(JSON.stringify(out.result)).not.toContain('claim-secret-sample');
    });

    it('join again claims it: still pending, then the key saved and the claim forgotten', async () => {
      vi.mocked(pendingKeyRequest).mockResolvedValue(stored);
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(answer(202, { ok: true, status: 'pending' }))
        .mockResolvedValueOnce(answer(200, { ok: true, apiKey: 'ak_live_new', apiKeyId: 'k2', revokedKeys: 1, agnt: { address: ADDRESS } }));
      global.fetch = fetchMock as any;
      const waiting = await networkJoin({ profile: 'claude-code' });
      expect(waiting.result).toMatchObject({ status: 'approval_pending' });
      expect(saveProfile).not.toHaveBeenCalled();
      const done = await networkJoin({ profile: 'claude-code' });
      expect(fetchMock.mock.calls[1][0]).toBe('https://api.example.test/portal/auth/agent/key-requests/kr1/claim');
      expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ claimSecret: 'claim-secret-sample' });
      expect(saveProfile).toHaveBeenCalledWith('claude-code', { apiUrl: 'https://api.example.test', apiKey: 'ak_live_new', apiKeyId: 'k2', account: 'acme' });
      expect(setPendingKeyRequest).toHaveBeenLastCalledWith('claude-code', undefined);
      expect(done.result).toMatchObject({ status: 'joined', address: ADDRESS });
    });

    it('a request already open (409 key_request_open): the profile\'s own is claimed; someone else\'s is explained plainly', async () => {
      const open = (id: string) => answer(409, { status: 409, error_code: 'key_request_open', error: 'A request for a new key for this address is already open.', details: { address: ADDRESS, keyRequestId: id, state: 'pending', expiresAt: '2026-11-17T12:00:00.000Z', retryable: false } });
      // Its own: claimed (still pending here), never a second request.
      vi.mocked(pendingKeyRequest).mockResolvedValue(stored);
      const fetchMock = vi.fn().mockResolvedValueOnce(open('kr1')).mockResolvedValueOnce(answer(202, { ok: true, status: 'pending' }));
      global.fetch = fetchMock as any;
      const own = await networkJoin({ email: 'person@example.com', code: '1', account: 'acme', apiUrl: 'https://api.example.test', username: 'claude-code-7k3m9q2x', profile: 'claude-code' });
      expect(fetchMock.mock.calls[1][0]).toBe('https://api.example.test/portal/auth/agent/key-requests/kr1/claim');
      expect(own.result).toMatchObject({ status: 'approval_pending', address: ADDRESS });
      expect(own.exitCode).toBe(75);
      expect(saveProfile).not.toHaveBeenCalled();

      // Not its own (none kept, or another id): the refusal, with what to do.
      for (const kept of [undefined, { ...stored, id: 'kr-other' }]) {
        vi.mocked(pendingKeyRequest).mockResolvedValue(kept);
        global.fetch = vi.fn().mockResolvedValueOnce(open('kr9')) as any;
        const err: any = await networkJoin({ email: 'person@example.com', code: '1', account: 'acme', apiUrl: 'https://api.example.test', username: 'claude-code-7k3m9q2x', profile: 'claude-code' }).catch((e) => e);
        expect(err.errorCode).toBe('key_request_open');
        expect(err.cliHint).toMatch(/open request for a new key/);
        expect(err.cliHint).toMatch(/deny it in the app/);
        expect(err.cliHint).toMatch(/current key keeps working/);
      }
      expect(saveProfile).not.toHaveBeenCalled();
      expect(setPendingKeyRequest).not.toHaveBeenCalledWith('claude-code', undefined);
    });

    it('denied: the claim is forgotten, nothing saved, and the agent says so', async () => {
      vi.mocked(pendingKeyRequest).mockResolvedValue(stored);
      global.fetch = vi.fn().mockResolvedValueOnce(answer(403, { status: 403, error_code: 'key_request_denied', error: 'Denied' })) as any;
      const out = await networkJoin({ profile: 'claude-code' });
      expect(out.exitCode).toBe(1);
      expect(out.result).toMatchObject({ status: 'key_request_denied' });
      expect(saveProfile).not.toHaveBeenCalled();
      expect(setPendingKeyRequest).toHaveBeenCalledWith('claude-code', undefined);
    });
  });
});
