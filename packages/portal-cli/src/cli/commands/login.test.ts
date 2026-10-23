import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { signupFieldsFrom, verifyErrorHint, verifyExitCode, finishCommand, tellUserConnected, runLogin } from './login.js';
import { saveProfile } from '../utils/credentials.js';
import { AgntApiError } from '../../HttpClient.js';
import { DEFAULT_ACCOUNT_NAME } from '../../defaults.js';

// The app's name as this build was hydrated with it (the bare token when not hydrated): never a fixed name.
const APP = DEFAULT_ACCOUNT_NAME;
const APP_RE = APP.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

vi.mock('../utils/credentials.js', () => ({
  saveProfile: vi.fn().mockResolvedValue(undefined),
  resolveProfileName: vi.fn().mockImplementation(async (name?: string) => name ?? 'default'),
}));

describe('signupFieldsFrom', () => {
  it('passes the timezone and names, trimmed', () => {
    expect(signupFieldsFrom({ email: 'p@example.com', timezone: ' Europe/Paris ', firstName: ' Ada ', lastName: 'Lovelace' }))
      .toEqual({ fields: { timezone: 'Europe/Paris', firstName: 'Ada', lastName: 'Lovelace' } });
  });

  it('sends nothing new when no sign-up flag is given', () => {
    expect(signupFieldsFrom({ email: 'p@example.com' })).toEqual({ fields: {} });
  });

  it('builds timezone, names, purpose and the agent', () => {
    expect(signupFieldsFrom({
      email: 'p@example.com', timezone: ' America/New_York ', firstName: 'Ada', lastName: 'Lovelace', purpose: 'Account',
      agentUsername: 'Sally', agentDisplayName: 'Sally', agentProduct: 'Muse', agentEmail: 'sally@example.org',
    })).toEqual({ fields: {
      timezone: 'America/New_York', firstName: 'Ada', lastName: 'Lovelace', purpose: 'account',
      agent: { username: 'sally', displayName: 'Sally', product: 'Muse', email: 'sally@example.org' },
    } });
  });

  it('refuses before any code is requested: a bad purpose, an agent with no purpose, network with no agent, a bad username', () => {
    expect(signupFieldsFrom({ email: 'p', purpose: 'both' })).toHaveProperty('error');
    expect(signupFieldsFrom({ email: 'p', agentUsername: 'sally' })).toHaveProperty('error');
    expect(signupFieldsFrom({ email: 'p', purpose: 'network' })).toHaveProperty('error');
    expect(signupFieldsFrom({ email: 'p', purpose: 'account', agentUsername: 's' })).toHaveProperty('error');
    expect(signupFieldsFrom({ email: 'p', purpose: 'account', agentUsername: '-sally' })).toHaveProperty('error');
    expect(signupFieldsFrom({ email: 'p', purpose: 'account', agentProduct: 'Muse' })).toHaveProperty('error');
  });

  it('allows purpose account with no agent', () => {
    expect(signupFieldsFrom({ email: 'p', purpose: 'account' })).toEqual({ fields: { purpose: 'account' } });
  });
});

describe('verifyErrorHint', () => {
  const err = (status: number, code: string, message = 'x') => new AgntApiError(status, message, code);

  it('a taken username before the code was spent: the same code still works', () => {
    const hint = verifyErrorHint(err(409, 'agnt_username_taken', 'That username is taken; choose another'), '123456')!;
    expect(hint).toMatch(/still good/);
    expect(hint).toContain('--code 123456');
  });

  it('a taken username after the code was spent: ask for a new code', () => {
    const hint = verifyErrorHint(err(409, 'agnt_username_taken', 'That username was just taken; choose another and request a new code'), '123456')!;
    expect(hint).toMatch(/without --code/);
    expect(hint).not.toContain('123456');
  });

  it('a reserved or malformed username, or a missing purpose, keeps the code', () => {
    for (const code of ['agnt_username_reserved', 'invalid_username', 'purpose_required', 'purpose_not_supported', 'agent_required']) {
      expect(verifyErrorHint(err(400, code), '999')).toContain('--code 999');
    }
  });

  it('agnt_not_enabled: only the operator can turn it on; stop and tell the user (exit 1)', () => {
    const e = err(400, 'agnt_not_enabled', 'Agent sign-up is not enabled for this app; nothing was created and your code still works.');
    expect(verifyErrorHint(e, '313131')).toBe(`The ${APP} Network isn't turned on for this app yet; only its operator can turn it on. Stop and tell your user; nothing you run can fix it.`);
    expect(verifyExitCode(e)).toBe(1);
  });

  it('a 503 agnt_unavailable_code_kept: retry later with the same code, exit 75', () => {
    const e = err(503, 'agnt_unavailable_code_kept', 'Agent sign-up is temporarily unavailable.');
    const hint = verifyErrorHint(e, '424242')!;
    expect(hint).toMatch(/code is still good/);
    expect(hint).toContain('--code 424242');
    expect(verifyExitCode(e)).toBe(75);
  });

  it('a 503 agnt_unavailable_new_code: get a new code, and the command must change (exit 1)', () => {
    const e = err(503, 'agnt_unavailable_new_code', 'Agent sign-up is temporarily unavailable.');
    const hint = verifyErrorHint(e, '424242')!;
    expect(hint).toMatch(/your code was used/);
    expect(hint).toMatch(/without --code/);
    expect(hint).not.toContain('424242');
    expect(verifyExitCode(e)).toBe(1);
  });

  it('a refused flag keeps the code; too many attempts says how long to wait', () => {
    expect(verifyErrorHint(err(400, 'bad_request'), '42')).toMatch(/still good: run the same command with --code 42/);
    expect(verifyErrorHint(new AgntApiError(429, 'x', 'rate_limited', { retryAfter: 30 }), '1')).toMatch(/Wait 30 seconds/);
    expect(verifyExitCode(err(503, 'unavailable'))).toBe(75);
    expect(verifyExitCode(err(400, 'otp_expired'))).toBe(1);
  });

  it('an expired code asks for a new one from the user; a wrong code asks them to check it', () => {
    expect(verifyErrorHint(err(400, 'otp_expired'), '1')).toMatch(/without --code.*ask your user/);
    expect(verifyErrorHint(err(400, 'otp_invalid'), '1')).toMatch(/Ask your user .* check the code/);
    expect(verifyExitCode(err(429, 'rate_limited'))).toBe(75);
  });

  it('a plain agnt_unavailable tries the same code first', () => {
    expect(verifyErrorHint(err(503, 'agnt_unavailable'), '5')).toMatch(/wait a few minutes.*--code 5/i);
  });
});

describe('finishCommand and tellUserConnected', () => {
  it('repeats the plain flags, ready for --code', () => {
    expect(finishCommand({ email: 'p@example.com', profile: 'a', timezone: 'Europe/Paris', firstName: 'Ada Lovelace' }))
      .toMatch(/ login --email p@example\.com --profile a --timezone Europe\/Paris --first-name 'Ada Lovelace' --code <the code>$/);
  });

  it('tells the user they are signed in', () => {
    const base = { ok: true, user: { id: 'u', email: 'p@example.com', portalOnboarded: false }, apiKey: 'k', apiKeyId: 'i' };
    expect(tellUserConnected(base)).toMatch(/^You're signed in to .* as p@example\.com\.$/);
  });

  it('repeats the flags as given, ready for --code', () => {
    expect(finishCommand({ email: 'p@example.com', purpose: 'network', agentUsername: 'sally', agentDisplayName: 'Sally Bot', profile: 'a' }))
      .toMatch(/ login --email p@example\.com --profile a --purpose network --agent-username sally --agent-display-name 'Sally Bot' --code <the code>$/);
  });

});

describe('runLogin against a mocked API', () => {
  const originalFetch = global.fetch;
  let stdout: string[];
  let stderr: string[];

  beforeEach(() => {
    stdout = []; stderr = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((s: string) => { stdout.push(s); return true; }) as any);
    vi.spyOn(process.stderr, 'write').mockImplementation(((s: string) => { stderr.push(s); return true; }) as any);
    vi.mocked(saveProfile).mockClear();
  });
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  const signupResponse = {
    ok: true,
    user: { id: 'u1', email: 'person@example.com', firstName: 'Ada', lastName: 'Lovelace', portalOnboarded: false },
    apiKey: 'ak_live_secret', apiKeyId: 'k1',
    profile: { timezone: { value: 'America/New_York', confirmed: true, source: 'declared' }, toFill: [{ field: 'workingHours', reason: 'default', set: 'PUT /users/u1/preferences/scheduling' }] },
    purpose: 'network',
    agnt: { address: 'sally@agent.example.test', assistant: 'as1', pair: 'p1', custody: 'openassistant',
      email: { value: 'sally@example.org', verification: 'code_sent' } },
  };

  function mockFetch(response: unknown, status = 201) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: status < 400, status, headers: new Headers(), text: async () => JSON.stringify(response),
    });
    global.fetch = fetchMock as any;
    return fetchMock;
  }

  const plainResponse = { ok: true, user: { id: 'u1', email: 'person@example.com', portalOnboarded: false }, apiKey: 'ak_live_secret', apiKeyId: 'k1' };

  it('step 1, plain: emails the code, never reads stdin, says where to find it and what to ask', async () => {
    const fetchMock = mockFetch({ ok: true }, 200);
    const stdinRead = vi.spyOn(process.stdin, 'read');
    await runLogin({ email: 'person@example.com', account: 'acme', apiUrl: 'https://api.example.test' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/portal/auth/agent/start');
    expect(stdinRead).not.toHaveBeenCalled();
    const out = JSON.parse(stdout.join(''));
    expect(out).toMatchObject({ status: 'code_sent', askUser: "I've emailed a code to person@example.com to confirm it's you. What is it?" });
    expect(out.next).toMatch(/ login --email person@example\.com --account acme --api-url https:\/\/api\.example\.test --code <the code>$/);
    expect(out.findCode).toMatch(/inbox.*first/);
  });

  it('step 2, plain: saves the key, never prints it, says what to tell the user', async () => {
    const fetchMock = mockFetch(plainResponse);
    await runLogin({ email: 'person@example.com', account: 'acme', code: '123456', label: 'test', apiUrl: 'https://api.example.test' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: 'person@example.com', account: 'acme', code: '123456', label: 'test' });
    expect(saveProfile).toHaveBeenCalledWith('default', { apiUrl: 'https://api.example.test', apiKey: 'ak_live_secret', apiKeyId: 'k1', account: 'acme' });
    const out = JSON.parse(stdout.join(''));
    expect(out).toMatchObject({ status: 'connected', savedProfile: 'default' });
    expect(out.apiKey).toBeUndefined();
    expect(out.tellUser).toMatch(/signed in/);
    expect(out.next).toEqual([expect.stringMatching(/ tasks list$/)]);
    expect(stderr.join('')).not.toMatch(/onboard|working hours/i);
  });

  it('step 1 emails the code, never reads stdin, and says what to ask the user', async () => {
    const fetchMock = mockFetch({ ok: true }, 200);
    const stdinRead = vi.spyOn(process.stdin, 'read');
    await runLogin({ email: 'person@example.com', account: 'acme', apiUrl: 'https://api.example.test', purpose: 'network', agentUsername: 'sally' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/portal/auth/agent/start');
    expect(stdinRead).not.toHaveBeenCalled();
    const out = JSON.parse(stdout.join(''));
    expect(out).toMatchObject({ status: 'code_sent', email: 'person@example.com', askUser: "I've emailed a code to person@example.com to confirm it's you. What is it?" });
    expect(out.next).toContain('--agent-username sally');
    expect(out.next).toContain('--code <the code>');
    expect(out.findCode).toMatch(/inbox.*first/);
    expect(stderr.join('')).toMatch(/Otherwise ask your user, in your conversation/);
  });

  it('step 2 sends the fields with the code, saves the key, and says what to tell the user, with no onboarding step', async () => {
    const fetchMock = mockFetch(signupResponse);
    await runLogin({
      email: 'person@example.com', account: 'acme', code: '123456', label: 'test', apiUrl: 'https://api.example.test',
      purpose: 'network', timezone: 'America/New_York', agentUsername: 'sally', agentEmail: 'sally@example.org',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.test/portal/auth/agent/verify');
    expect(JSON.parse(init.body)).toEqual({
      email: 'person@example.com', account: 'acme', code: '123456', label: 'test',
      timezone: 'America/New_York', purpose: 'network', agent: { username: 'sally', email: 'sally@example.org' },
    });
    expect(saveProfile).toHaveBeenCalledWith('default', { apiUrl: 'https://api.example.test', apiKey: 'ak_live_secret', apiKeyId: 'k1', account: 'acme' });
    const out = JSON.parse(stdout.join(''));
    expect(out.apiKey).toBeUndefined();
    expect(out).toMatchObject({ status: 'connected', purpose: 'network', savedProfile: 'default', agnt: { address: 'sally@agent.example.test' } });
    expect(out.tellUser).toMatch(/sally@agent\.example\.test/);
    expect(out.agentEmail).toMatchObject({ value: 'sally@example.org', verification: 'code_sent' });
    expect(out.agentEmail.next).toMatch(/agent-email verify sally@example.org/);
    const text = stderr.join('');
    expect(text).toMatch(/Tell your user:/);
    expect(text).not.toMatch(/onboard|working hours|workingHours|Still to fill/i);
  });

  it('step 2 with sign-up flags: sends them, and an app that reads them needs no second call', async () => {
    const fetchMock = mockFetch(signupResponse);
    await runLogin({ email: 'person@example.com', account: 'acme', code: '123456', label: 't', apiUrl: 'https://api.example.test',
      timezone: 'America/New_York', firstName: 'Ada', lastName: 'Lovelace' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ timezone: 'America/New_York', firstName: 'Ada', lastName: 'Lovelace' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(stdout.join('')).profile.timezone).toMatchObject({ value: 'America/New_York', confirmed: true });
  });

  it('a wrong code: exit 1, and the hint says to ask the user to check it', async () => {
    mockFetch({ status: 400, error_code: 'otp_invalid', error: 'Invalid code' }, 400);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code: number) => { throw new Error(`exit ${code}`); }) as any);
    await expect(runLogin({ email: 'p@example.com', account: 'acme', code: '9', label: 't' })).rejects.toThrow('exit 1');
    expect(JSON.parse(stderr.join('')).error).toMatchObject({ code: 'otp_invalid', retryable: false, hint: expect.stringMatching(/check the code/) });
    expect(saveProfile).not.toHaveBeenCalled();
    exit.mockRestore();
  });

  it('--json keeps stderr quiet', async () => {
    mockFetch(plainResponse);
    await runLogin({ email: 'person@example.com', account: 'acme', code: '123456', label: 't', json: true });
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout.join('')).status).toBe('connected');
  });

  const verified = { ok: true, status: 201, headers: new Headers(), text: async () => JSON.stringify({ ok: true, user: { id: 'u1', email: 'p@example.com', portalOnboarded: false }, apiKey: 'ak', apiKeyId: 'k' }) };

  it('an app that does not read sign-up fields: signed in, no onboarding step, the timezone set quietly when the account has none', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(verified)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ user: { id: 'u1', timezone: null } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ user: { id: 'u1' } }) });
    global.fetch = fetchMock as any;
    await runLogin({ email: 'p@example.com', account: 'acme', code: '1', label: 't', apiUrl: 'https://api.example.test', timezone: 'Europe/Paris' });
    expect(fetchMock.mock.calls[2][0]).toBe('https://api.example.test/profile');
    expect(fetchMock.mock.calls[2][1].method).toBe('PATCH');
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ timezone: 'Europe/Paris' });
    expect(stderr.join('')).not.toMatch(/onboard/i);
    expect(JSON.parse(stdout.join('')).tellUser).toMatch(/signed in/);
  });

  it('never replaces a timezone the account already has', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(verified)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ user: { id: 'u1', timezone: 'Europe/Paris' } }) });
    global.fetch = fetchMock as any;
    await runLogin({ email: 'p@example.com', account: 'acme', code: '1', label: 't', apiUrl: 'https://api.example.test', timezone: 'America/New_York' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some((c: any[]) => c[1]?.method === 'PATCH')).toBe(false);
  });

  it('a spent code (otp_max_attempts, a 429) is final: exit 1, ask for a new code', async () => {
    mockFetch({ status: 429, error_code: 'otp_max_attempts', error: 'Too many incorrect attempts' }, 429);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code: number) => { throw new Error(`exit ${code}`); }) as any);
    await expect(runLogin({ email: 'p@example.com', account: 'acme', code: '9', label: 't' })).rejects.toThrow('exit 1');
    expect(JSON.parse(stderr.join('')).error).toMatchObject({ code: 'otp_max_attempts', retryable: false, hint: expect.stringMatching(/without --code/) });
    exit.mockRestore();
  });

  it('step 1 with no answer from the API may pass later: exit 75', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed')) as any;
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code: number) => { throw new Error(`exit ${code}`); }) as any);
    await expect(runLogin({ email: 'p@example.com', account: 'acme' })).rejects.toThrow('exit 75');
    expect(JSON.parse(stderr.join('')).error).toMatchObject({ retryable: true, hint: expect.stringMatching(/No answer/) });
    exit.mockRestore();
  });

  it('step 1 carries an API chosen by AGNT_API_URL into the step-2 command', async () => {
    mockFetch({ ok: true }, 200);
    vi.stubEnv('AGNT_API_URL', 'https://api.test.example');
    try {
      await runLogin({ email: 'p@example.com', account: 'acme' });
    } finally {
      vi.unstubAllEnvs();
    }
    const out = JSON.parse(stdout.join(''));
    expect(out.next).toMatch(/--api-url https:\/\/api\.test\.example --code <the code>$/);
    // The code goes somewhere other than the default API: say so, in the output the agent reads.
    expect(out).toMatchObject({ apiUrl: 'https://api.test.example', warning: expect.stringMatching(/not the default API/) });
  });

  it('refuses a plain-http API that is not on this computer, before sending anything (exit 2)', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as any;
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code: number) => { throw new Error(`exit ${code}`); }) as any);
    await expect(runLogin({ email: 'p@example.com', account: 'acme', apiUrl: 'http://api.example.test' })).rejects.toThrow('exit 2');
    expect(fetchMock).not.toHaveBeenCalled();
    exit.mockRestore();
  });

  it('the printed step-2 command quotes values, and a value starting with "-" can never read as a flag', () => {
    expect(finishCommand({ email: 'p@example.com', firstName: '-x', lastName: "O'Neil" }))
      .toMatch(/ --email p@example\.com --first-name=-x --last-name 'O'\\''Neil' --code <the code>$/);
  });

  it('a refused username exits with JSON guidance that keeps the code', async () => {
    mockFetch({ status: 409, error_code: 'agnt_username_taken', error: 'That username is taken; choose another' }, 409);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code: number) => { throw new Error(`exit ${code}`); }) as any);
    await expect(runLogin({ email: 'p@example.com', account: 'acme', code: '654321', label: 't', purpose: 'account', agentUsername: 'sally' }))
      .rejects.toThrow('exit 1');
    expect(JSON.parse(stderr.join('')).error.hint).toMatch(/still good.*--code 654321/);
    expect(saveProfile).not.toHaveBeenCalled();
    exit.mockRestore();
  });

  it('a 503 that used the code exits 1 and says to drop --code', async () => {
    mockFetch({ status: 503, error_code: 'agnt_unavailable_new_code', error: 'Agent sign-up is temporarily unavailable.' }, 503);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code: number) => { throw new Error(`exit ${code}`); }) as any);
    await expect(runLogin({ email: 'p@example.com', account: 'acme', code: '777777', label: 't', purpose: 'account', agentUsername: 'sally' }))
      .rejects.toThrow('exit 1');
    expect(JSON.parse(stderr.join('')).error.hint).toMatch(/without --code/);
    exit.mockRestore();
  });

  it('a 503 that kept the code exits 75 and says to reuse it', async () => {
    mockFetch({ status: 503, error_code: 'agnt_unavailable_code_kept', error: 'Agent sign-up is temporarily unavailable.' }, 503);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code: number) => { throw new Error(`exit ${code}`); }) as any);
    await expect(runLogin({ email: 'p@example.com', account: 'acme', code: '888888', label: 't', purpose: 'account', agentUsername: 'sally' }))
      .rejects.toThrow('exit 75');
    expect(JSON.parse(stderr.join('')).error).toMatchObject({ retryable: true, hint: expect.stringMatching(/--code 888888/) });
    exit.mockRestore();
  });

  it('no --email: exit 2, with the line to ask the user for theirs', async () => {
    const fetchMock = mockFetch(signupResponse);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code: number) => { throw new Error(`exit ${code}`); }) as any);
    await expect(runLogin({ email: '' } as any)).rejects.toThrow('exit 2');
    expect(JSON.parse(stderr.join('')).error.askUser).toMatch(/^I need to sign you up for a free .* account\. What's your email address\? Each of your agents needs its own/);
    expect(fetchMock).not.toHaveBeenCalled();
    exit.mockRestore();
  });

  it('a usage problem exits 2 before any request', async () => {
    const fetchMock = mockFetch(signupResponse);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code: number) => { throw new Error(`exit ${code}`); }) as any);
    await expect(runLogin({ email: 'p@example.com', account: 'acme', agentUsername: 'sally' })).rejects.toThrow('exit 2');
    expect(fetchMock).not.toHaveBeenCalled();
    exit.mockRestore();
  });
});
