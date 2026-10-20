import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { signupFieldsFrom, verifyErrorHint, verifyExitCode, finishCommand, tellUserConnected, runLogin } from './login.js';
import { saveProfile } from '../utils/credentials.js';
import { AgntApiError } from '../../HttpClient.js';

vi.mock('../utils/credentials.js', () => ({
  saveProfile: vi.fn().mockResolvedValue(undefined),
  resolveProfileName: vi.fn().mockImplementation(async (name?: string) => name ?? 'default'),
}));

describe('signupFieldsFrom', () => {
  it('sends nothing new when no sign-up flag is given (apps without AGNT messaging are unchanged)', () => {
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

  it('agnt_not_enabled: tell the user sign-up is not on yet; the code still works (exit 1)', () => {
    const e = err(400, 'agnt_not_enabled', 'Agent sign-up is not enabled for this app; nothing was created and your code still works.');
    const hint = verifyErrorHint(e, '313131')!;
    expect(hint).toMatch(/^Tell your user: "Agent sign-up isn't on for this app yet; your code still works/);
    expect(hint).toContain('--code 313131');
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

  it('an expired code asks for a new one from the user; a plain agnt_unavailable tries the same code first', () => {
    expect(verifyErrorHint(err(400, 'otp_expired'), '1')).toMatch(/without --code.*ask your user/);
    expect(verifyErrorHint(err(503, 'agnt_unavailable'), '5')).toMatch(/wait a few minutes.*--code 5/i);
  });
});

describe('finishCommand and tellUserConnected', () => {
  it('repeats the flags as given, ready for --code', () => {
    expect(finishCommand({ email: 'p@example.com', purpose: 'network', agentUsername: 'sally', agentDisplayName: 'Sally Bot', profile: 'a' }))
      .toMatch(/ login --email p@example\.com --profile a --purpose network --agent-username sally --agent-display-name 'Sally Bot' --code <the code>$/);
  });

  it('tells the user the address, by purpose', () => {
    const base = { ok: true, user: { id: 'u', email: 'p@example.com', portalOnboarded: false }, apiKey: 'k', apiKeyId: 'i' };
    const agnt = { address: 'sally@agent.example.test', assistant: 'a', pair: 'p', custody: 'openassistant' as const };
    expect(tellUserConnected({ ...base, purpose: 'network', agnt })).toMatch(/OpenAssistant Network.*sally@agent\.example\.test/);
    expect(tellUserConnected({ ...base })).toMatch(/signed in/);
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

  it('--json keeps stderr quiet', async () => {
    mockFetch(signupResponse);
    await runLogin({ email: 'person@example.com', account: 'acme', code: '123456', label: 't', purpose: 'network', agentUsername: 'sally', json: true });
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout.join('')).status).toBe('connected');
  });

  it('an app without AGNT messaging: signed in, no onboarding step, the timezone set quietly', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 201, headers: new Headers(), text: async () => JSON.stringify({ ok: true, user: { id: 'u1', email: 'p@example.com', portalOnboarded: false }, apiKey: 'ak', apiKeyId: 'k' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ user: { id: 'u1' } }) });
    global.fetch = fetchMock as any;
    await runLogin({ email: 'p@example.com', account: 'acme', code: '1', label: 't', apiUrl: 'https://api.example.test', timezone: 'Europe/Paris' });
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.example.test/profile');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ timezone: 'Europe/Paris' });
    expect(stderr.join('')).not.toMatch(/onboard/i);
    expect(JSON.parse(stdout.join('')).tellUser).toMatch(/signed in/);
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
    expect(JSON.parse(stderr.join('')).error.askUser).toMatch(/^I need to sign you up for a free .* account\. What's your email address\?$/);
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
