import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { agntLeave, runAgntLeave, agntBlock, agntUnblock, agntBlocks, describeError, AgntUsageError, EXIT_RETRY, EXIT_USAGE } from './agnt.js';
import { AgntApiError } from '../../HttpClient.js';
import { clientFor } from '../utils/api.js';
import { removeProfile } from '../utils/credentials.js';
import { DEFAULT_ACCOUNT_NAME } from '../../defaults.js';

// The app's name as this build was hydrated with it (the bare token when not hydrated): never a fixed name.
const APP = DEFAULT_ACCOUNT_NAME;
const APP_RE = APP.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

vi.mock('../utils/api.js', () => ({ clientFor: vi.fn() }));
vi.mock('../utils/credentials.js', () => ({
  removeProfile: vi.fn().mockResolvedValue(undefined),
  resolveProfileName: vi.fn().mockResolvedValue('default'),
  listProfileNames: vi.fn().mockResolvedValue(['claude-code']),
}));

const ADDRESS = 'claude-code-7k3m9q2x@agent.example.test';

function client(leave = vi.fn()) {
  return { agnt: { whoami: vi.fn().mockResolvedValue({ address: ADDRESS }), leave } } as any;
}

describe('agnt leave', () => {
  it('without --confirm: changes nothing, exit 2, with the question to ask the user', async () => {
    const c = client();
    const err = await agntLeave(c, {}).catch((e) => e);
    expect(err).toBeInstanceOf(AgntUsageError);
    expect(c.agnt.leave).not.toHaveBeenCalled();
    const { body, exitCode } = describeError('leave', err);
    expect(exitCode).toBe(EXIT_USAGE);
    expect(body.askUser).toMatch(new RegExp(`^Do you want me to leave the ${APP_RE} Network\\? .*${ADDRESS.replace(/\./g, '\\.')}.*can't be undone: if I join again later, I'll get a new Network ID\\.$`));
    expect(body.message).toContain(`agnt leave --confirm ${ADDRESS}`);
    expect(body.askUser).toMatch(new RegExp(`Your ${APP_RE} account stays as it is: leaving never deletes it\\.`));
    expect(body.askUser).not.toMatch(/would be deleted|is deleted/);
  });

  it('a --confirm that is not the agent\'s own address changes nothing', async () => {
    const c = client();
    await expect(agntLeave(c, { confirm: 'someone-else@agent.example.test' })).rejects.toBeInstanceOf(AgntUsageError);
    expect(c.agnt.leave).not.toHaveBeenCalled();
  });

  it('with the right address (any case): leaves, and tells the user the account stays', async () => {
    const leave = vi.fn().mockResolvedValue({ status: 'left', address: ADDRESS, registration: 'kept', keysRevoked: 2 });
    const { result } = await agntLeave(client(leave), { confirm: ADDRESS.toUpperCase() }) as any;
    expect(leave).toHaveBeenCalledWith(ADDRESS);
    expect(result).toMatchObject({ status: 'left', registration: 'kept', keysRevoked: 2 });
    expect(result.tellUser).toMatch(new RegExp(`left the ${APP_RE} Network.*no longer reaches me\\. Your ${APP_RE} account stays as it is\\.$`));
    expect(result.tellUser).not.toMatch(/delet|email/);
  });

  it('promises the disconnection email only when the server says it went', async () => {
    const leave = vi.fn().mockResolvedValue({ status: 'left', address: ADDRESS, registration: 'kept', keysRevoked: 1, emailed: true });
    const { result } = await agntLeave(client(leave), { confirm: ADDRESS }) as any;
    expect(result.tellUser).toMatch(/stays as it is\. An email saying I was disconnected is on its way to you\.$/);
  });

  it('after leaving, a 401 means the leave went through: logout, never a new sign-up', () => {
    expect(describeError('leave', new AgntApiError(401, 'x', 'unauthorized')).body.hint).toMatch(/leave already went through.*logout/);
    expect(describeError('wait', new AgntApiError(401, 'x', 'unauthorized')).body.hint).toMatch(/Join again only if your person wants you on the network/);
  });

  it('an older server that says it deleted the account is reported plainly', async () => {
    const leave = vi.fn().mockResolvedValue({ status: 'left', address: ADDRESS, registration: 'deleted', keysRevoked: 1 });
    const { result } = await agntLeave(client(leave), { confirm: ADDRESS }) as any;
    expect(result.tellUser).toMatch(new RegExp(`Unlike what I said before, the app's older server also deleted your ${APP_RE} account`));
  });

  it('network_scope says the key is for network commands only, and the rest is the person\'s', () => {
    expect(describeError('send', new AgntApiError(403, 'x', 'network_scope')).body.hint)
      .toMatch(new RegExp(`^Your key only works for ${APP_RE} Network commands and your profile\\. Everything else in the account is your person's: they can sign in to ${APP_RE} to use it\\.$`));
  });

  it('maps the refusals plainly', () => {
    expect(describeError('leave', new AgntApiError(400, 'x', 'confirm_mismatch')).body.hint).toMatch(new RegExp(`own ${APP_RE} Network ID.*Nothing was changed`));
    expect(describeError('leave', new AgntApiError(403, 'x', 'pair_bound_key_required')).body.hint).toMatch(/Only the agent's own key.*link in the sign-up email/);
    expect(describeError('leave', new AgntApiError(409, 'x', 'already_left')).body.hint).toMatch(/already left.*logout/);
    const unavailable = describeError('leave', new AgntApiError(503, 'x', 'agnt_unavailable'));
    expect(unavailable.exitCode).toBe(EXIT_RETRY);
    expect(unavailable.body.hint).toMatch(/a retry finishes it/);
  });
});

describe('runAgntLeave', () => {
  let out: string[];
  beforeEach(() => {
    out = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((s: string) => { out.push(s); return true; }) as any);
    vi.spyOn(process.stderr, 'write').mockImplementation((() => true) as any);
    vi.mocked(removeProfile).mockClear();
    process.exitCode = undefined;
    vi.stubEnv('CLAUDECODE', '1');
    vi.stubEnv('AGNT_CLI_PROFILE', '');
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); process.exitCode = undefined; });

  it('drops the agent\'s own profile once it has left', async () => {
    const leave = vi.fn().mockResolvedValue({ status: 'left', address: ADDRESS, registration: 'kept', keysRevoked: 1 });
    vi.mocked(clientFor).mockResolvedValue(client(leave));
    await runAgntLeave({ confirm: ADDRESS });
    expect(clientFor).toHaveBeenCalledWith('claude-code');
    expect(removeProfile).toHaveBeenCalledWith('claude-code');
    expect(JSON.parse(out.join('')).status).toBe('left');
  });

  it('keeps the profile when nothing was left (no confirm, or a refusal)', async () => {
    vi.mocked(clientFor).mockResolvedValue(client());
    await runAgntLeave({});
    expect(process.exitCode).toBe(EXIT_USAGE);
    const refused = vi.fn().mockRejectedValue(new AgntApiError(503, 'x', 'agnt_unavailable'));
    vi.mocked(clientFor).mockResolvedValue(client(refused));
    await runAgntLeave({ confirm: ADDRESS });
    expect(process.exitCode).toBe(EXIT_RETRY);
    expect(removeProfile).not.toHaveBeenCalled();
  });
});

describe('agnt block, unblock, blocks', () => {
  it('block: says what to tell the person, for an address or a whole domain', async () => {
    const block = vi.fn()
      .mockResolvedValueOnce({ block: { match: 'spam@agent.example.test', kind: 'address', createdAt: 'x' } })
      .mockResolvedValueOnce({ block: { match: '*@spam.example', kind: 'domain', createdAt: 'x' } });
    const c = { agnt: { block } } as any;
    expect((await agntBlock(c, ' spam@agent.example.test ') as any).result.tellUser).toMatch(/^I've blocked spam@agent\.example\.test: .*your other agents/);
    expect(block).toHaveBeenCalledWith('spam@agent.example.test');
    expect((await agntBlock(c, '*@spam.example') as any).result.tellUser).toMatch(/blocked everyone at spam\.example/);
  });

  it('unblock and blocks pass the API answer through', async () => {
    const c = { agnt: { unblock: vi.fn().mockResolvedValue({ removed: true }), listBlocks: vi.fn().mockResolvedValue({ blocks: [] }) } } as any;
    expect((await agntUnblock(c, '*@spam.example')).result).toEqual({ removed: true });
    expect((await agntBlocks(c)).result).toEqual({ blocks: [] });
  });

  it('maps the block refusals plainly', () => {
    expect(describeError('block', new AgntApiError(400, 'x', 'invalid_match')).body.hint).toMatch(/network address \(name@domain\), or \*@domain/);
    expect(describeError('block', new AgntApiError(409, 'x', 'agnt_blocks_full')).body.hint).toMatch(/Remove one first/);
    expect(describeError('unblock', new AgntApiError(403, 'x', 'pair_bound_key')).body.hint).toMatch(/your person can unblock from their own account/i);
  });
});
