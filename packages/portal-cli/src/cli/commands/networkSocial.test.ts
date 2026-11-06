import { describe, it, expect, vi } from 'vitest';
import { networkProfileSet, networkPost, networkFeed, ABOUT_MAX, POST_MAX } from './networkSocial.js';
import { forYourPersonOf, describeError, NetworkUsageError } from './network.js';
import { AgntApiError } from '../../HttpClient.js';

const fakeClient = (network: Record<string, unknown>) => ({ network }) as any;

describe('network profile', () => {
  it('sets one line, trimmed, and says the server\'s hint; refuses line breaks and over-long lines before sending', async () => {
    const setProfile = vi.fn().mockResolvedValue({ about: 'Florist', listed: true, hint: ' Listed. ' });
    const out = await networkProfileSet(fakeClient({ setProfile }), { about: '  Florist ' });
    expect(setProfile).toHaveBeenCalledWith('Florist', { assistant: undefined });
    expect(out.notice).toBe('note: Listed.');
    await expect(networkProfileSet(fakeClient({ setProfile }), { about: 'a\nb' })).rejects.toBeInstanceOf(NetworkUsageError);
    await expect(networkProfileSet(fakeClient({ setProfile }), { about: 'x'.repeat(ABOUT_MAX + 1) })).rejects.toBeInstanceOf(NetworkUsageError);
    expect(setProfile).toHaveBeenCalledTimes(1);
    // "" unlists: it is sent as is.
    await networkProfileSet(fakeClient({ setProfile }), { about: '' });
    expect(setProfile).toHaveBeenLastCalledWith('', { assistant: undefined });
  });

  it('without --about shows what whoami says, and whether it is listed', async () => {
    const shown = await networkProfileSet(fakeClient({ whoami: vi.fn().mockResolvedValue({ address: 'me@x.test', about: 'Florist' }) }), {});
    expect(shown.result).toEqual({ address: 'me@x.test', about: 'Florist', listed: true });
    const none = await networkProfileSet(fakeClient({ whoami: vi.fn().mockResolvedValue({ address: 'me@x.test' }) }), {});
    expect(none.result).toMatchObject({ about: '', listed: false });
    expect(none.notice).toMatch(/discover does not list you/);
  });
});

describe('network post and feed', () => {
  it('posts the text (or stdin), refusing an empty or over-long one', async () => {
    const post = vi.fn().mockResolvedValue({ id: 'p', from: 'me@x.test', text: 't', postedAt: 'x' });
    await networkPost(fakeClient({ post }), { text: '-' }, () => ' from stdin \n');
    expect(post).toHaveBeenCalledWith('from stdin', { assistant: undefined });
    for (const text of [undefined, '   ', 'x'.repeat(POST_MAX + 1)]) {
      await expect(networkPost(fakeClient({ post }), { text })).rejects.toBeInstanceOf(NetworkUsageError);
    }
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('feed passes --q, --from (a bare username completed) and --limit 1 to 50', async () => {
    const feed = vi.fn().mockResolvedValue({ posts: [] });
    const whoami = vi.fn().mockResolvedValue({ address: 'me@x.test' });
    await networkFeed(fakeClient({ feed, whoami }), { q: ' peonies ', from: 'lee', limit: '50' });
    expect(feed).toHaveBeenCalledWith({ q: 'peonies', from: 'lee@x.test', limit: 50, assistant: undefined });
    for (const limit of ['0', '51', 'x']) await expect(networkFeed(fakeClient({ feed }), { limit })).rejects.toBeInstanceOf(NetworkUsageError);
  });
});

describe('FOR YOUR PERSON', () => {
  it('collects every forYourPerson the server wrote, once each, in order, and nothing else', () => {
    expect(forYourPersonOf({
      forYourPerson: ' A ', invite: { forYourPerson: 'B' },
      recipients: [{ invite: { forYourPerson: 'B' } }, { forYourPerson: 'C' }, { tellYourPerson: 'not this' }, null],
    })).toEqual(['A', 'B', 'C']);
    for (const none of [null, undefined, 'x', {}, { recipients: 'no' }, { forYourPerson: 5 }, { invite: { forYourPerson: '  ' } }]) {
      expect(forYourPersonOf(none)).toEqual([]);
    }
  });
});

describe('errors from the contract v1 routes', () => {
  it('a too-old copy is told the npm command; the loop guard is never a retry; the server\'s own hint shows otherwise', () => {
    const old = describeError('send', new AgntApiError(426, 'too old', 'upgrade_required'));
    expect(old.body.hint).toMatch(/An older copy must be updated with the same npm command/);
    expect(describeError('send', new AgntApiError(400, 'too old', 'cli_too_old')).body.hint).toBe(old.body.hint);
    const guard = describeError('send', new AgntApiError(429, 'slow', 'thread_rate_limited', { body: { hint: 'Wait for replies.' } }));
    expect(guard).toMatchObject({ exitCode: 1, body: { retryable: false, hint: 'Wait for replies.' } });
    // A plain rate limit is still a retry.
    expect(describeError('send', new AgntApiError(429, 'slow', 'rate_limited')).exitCode).toBe(75);
    expect(describeError('profile', new AgntApiError(422, 'contact', 'about_has_contact', { body: { hint: ' No emails. ' } })).body.hint).toBe('No emails.');
  });
});
