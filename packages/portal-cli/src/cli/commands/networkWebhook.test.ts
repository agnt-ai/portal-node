import { describe, it, expect, vi } from 'vitest';
import { networkWebhookSet, networkWebhookShow, networkWebhookRemove, networkWebhookTest } from './networkWebhook.js';
import { NetworkUsageError, describeError, type WaitClock } from './network.js';
import { NetworkResource } from '../../resources/NetworkResource.js';
import { AgntApiError } from '../../HttpClient.js';

const T0 = Date.parse('2026-10-20T15:00:00.000Z');
const hook = (lastDelivery: any = null) => ({
  url: 'https://agent.example.test/push', status: 'active', consecutiveFailures: 0, lastDelivery,
  createdAt: '2026-10-20T14:00:00.000Z', updatedAt: '2026-10-20T14:00:00.000Z',
});

function fakeClock(): WaitClock {
  let t = T0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}

describe('webhook API calls', () => {
  it('set, show, remove and test hit /agnt/webhook as the contract says', async () => {
    const http = { get: vi.fn().mockResolvedValue({}), post: vi.fn().mockResolvedValue({}), delete: vi.fn().mockResolvedValue({}) } as any;
    const network = new NetworkResource(http);
    await network.setWebhook('https://agent.example.test/push');
    await network.setWebhook('https://agent.example.test/push', { rotateSecret: true, assistant: 'as1' });
    await network.getWebhook();
    await network.removeWebhook();
    await network.testWebhook();
    await network.testWebhook({ assistant: 'as 1' });
    expect(http.post.mock.calls).toEqual([
      ['/agnt/webhook', { url: 'https://agent.example.test/push' }],
      ['/agnt/webhook', { url: 'https://agent.example.test/push', rotateSecret: true, assistant: 'as1' }],
      ['/agnt/webhook/test'],
      ['/agnt/webhook/test?assistant=as%201'],
    ]);
    expect(http.get).toHaveBeenCalledWith('/agnt/webhook', { assistant: undefined });
    expect(http.delete).toHaveBeenCalledWith('/agnt/webhook', { assistant: undefined });
  });
});

describe('network webhook', () => {
  it('set needs --url', async () => {
    await expect(networkWebhookSet({ network: {} } as any, {})).rejects.toBeInstanceOf(NetworkUsageError);
  });

  it('set shows the secret once, with how to keep it; a replaced URL has no secret, only a note', async () => {
    const setWebhook = vi.fn()
      .mockResolvedValueOnce({ created: true, webhook: hook(), secret: 'whsec_test' })
      .mockResolvedValueOnce({ created: false, webhook: hook() });
    const c = { network: { setWebhook } } as any;
    const made = (await networkWebhookSet(c, { url: ' https://agent.example.test/push ', rotate: false }) as any).result;
    expect(made.secret).toBe('whsec_test');
    expect(made.storeSecret).toMatch(/shown only now.*never put it in a message.*--rotate/);
    expect(setWebhook).toHaveBeenCalledWith('https://agent.example.test/push', { rotateSecret: false, assistant: undefined });
    const replaced = (await networkWebhookSet(c, { url: 'https://agent.example.test/push' }) as any).result;
    expect(replaced).toEqual({ created: false, webhook: hook(), note: expect.stringMatching(/secret is unchanged.*--rotate/) });
    expect(replaced).not.toHaveProperty('secret');
    expect(replaced).not.toHaveProperty('storeSecret');
  });

  it('show and remove pass the answer through', async () => {
    const c = { network: { getWebhook: vi.fn().mockResolvedValue({ webhook: hook() }), removeWebhook: vi.fn().mockResolvedValue({ status: 'removed' }) } } as any;
    expect((await networkWebhookShow(c, {})).result).toEqual({ webhook: hook() });
    expect((await networkWebhookRemove(c, {})).result).toEqual({ status: 'removed' });
  });

  it('test reports its own push once it lands, ignoring an older delivery', async () => {
    const older = { at: '2026-10-20T14:50:00.000Z', kind: 'message', ok: true, httpStatus: 200 };
    const mine = { at: '2026-10-20T15:00:03.000Z', kind: 'test', ok: true, httpStatus: 204 };
    const getWebhook = vi.fn().mockResolvedValueOnce({ webhook: hook(older) }).mockResolvedValue({ webhook: hook(mine) });
    const c = { network: { testWebhook: vi.fn().mockResolvedValue({ queued: true }), getWebhook } } as any;
    const out = await networkWebhookTest(c, {}, fakeClock()) as any;
    expect(out).toEqual({ result: { queued: true, delivery: mine }, exitCode: 0 });
  });

  it('reads lastTest, which message pushes never overwrite, over lastDelivery', async () => {
    const mine = { at: '2026-10-20T15:00:02.000Z', kind: 'test', ok: true, httpStatus: 200 };
    const racing = { at: '2026-10-20T15:00:03.000Z', kind: 'message', ok: false, httpStatus: 500, error: 'http_500' };
    const c = { network: { testWebhook: vi.fn().mockResolvedValue({ queued: true }), getWebhook: vi.fn().mockResolvedValue({ webhook: { ...hook(racing), lastTest: mine } }) } } as any;
    expect(await networkWebhookTest(c, {}, fakeClock())).toEqual({ result: { queued: true, delivery: mine }, exitCode: 0 });
  });

  it('a lastTest from before this request does not count', async () => {
    const stale = { at: '2026-10-20T14:00:00.000Z', kind: 'test', ok: true, httpStatus: 200 };
    const c = { network: { testWebhook: vi.fn().mockResolvedValue({ queued: true }), getWebhook: vi.fn().mockResolvedValue({ webhook: { ...hook(null), lastTest: stale } }) } } as any;
    expect((await networkWebhookTest(c, { waitSeconds: 4 }, fakeClock()) as any).result.delivery).toBeNull();
  });

  it('a test push the receiver refused exits 1 with a hint', async () => {
    const failed = { at: '2026-10-20T15:00:02.000Z', kind: 'test', ok: false, httpStatus: 500, error: 'http_500' };
    const c = { network: { testWebhook: vi.fn().mockResolvedValue({ queued: true }), getWebhook: vi.fn().mockResolvedValue({ webhook: hook(failed) }) } } as any;
    const out = await networkWebhookTest(c, {}, fakeClock()) as any;
    expect(out.exitCode).toBe(1);
    expect(out.result.hint).toMatch(/answers 2xx quickly/);
  });

  it('no outcome within the wait: says to check show later', async () => {
    const c = { network: { testWebhook: vi.fn().mockResolvedValue({ queued: true }), getWebhook: vi.fn().mockResolvedValue({ webhook: hook(null) }) } } as any;
    const out = await networkWebhookTest(c, { waitSeconds: 6 }, fakeClock()) as any;
    expect(out.result).toMatchObject({ queued: true, delivery: null, note: expect.stringMatching(/network webhook show/) });
    expect(c.network.getWebhook).toHaveBeenCalledTimes(3);
  });

  it('maps the webhook refusals plainly', () => {
    expect(describeError('webhook', new AgntApiError(400, 'x', 'invalid_url')).body.hint).toMatch(/https on port 443/);
    expect(describeError('webhook', new AgntApiError(400, 'x', 'url_not_public')).body.hint).toMatch(/public host/);
    expect(describeError('webhook', new AgntApiError(409, 'x', 'webhook_disabled')).body.hint).toMatch(/turn it back on/);
    expect(describeError('webhook show', new AgntApiError(404, 'x', 'not_found')).body.hint).toMatch(/no webhook yet/);
    // Setting one on a network that is off is not "no webhook yet".
    expect(describeError('webhook set', new AgntApiError(404, 'Not found', 'not_found')).body.hint).toMatch(/isn't on for this app/);
  });

  it('show and test tell "no webhook" from a network that is off by the server\'s own words', () => {
    for (const verb of ['webhook show', 'webhook test']) {
      expect(describeError(verb, new AgntApiError(404, 'This agent has no webhook', 'not_found')).body.hint).toMatch(/no webhook yet/);
      expect(describeError(verb, new AgntApiError(404, 'Not found', 'not_found')).body.hint).toMatch(/isn't on for this app/);
    }
    expect(describeError('webhook remove', new AgntApiError(404, 'Not found', 'not_found')).body.hint).toMatch(/isn't on for this app/);
  });

  it('maps the rest of the webhook codes: rate_limited (exit 75), webhook_conflict, pair_bound_key', () => {
    const limited = describeError('webhook test', new AgntApiError(429, 'too many webhook test calls; try again later', 'rate_limited', { retryAfter: 42 }));
    expect(limited.exitCode).toBe(75);
    expect(limited.body).toMatchObject({ code: 'rate_limited', status: 429, retryable: true, retryAfter: 42 });
    expect(limited.body.hint).toMatch(/webhook changes or test pushes.*retryAfter/);
    const conflict = describeError('webhook set', new AgntApiError(409, 'changed', 'webhook_conflict'));
    expect(conflict.exitCode).toBe(1);
    expect(conflict.body.hint).toMatch(/same command once more/);
    const disabled = describeError('webhook test', new AgntApiError(409, 'disabled', 'webhook_disabled'));
    expect(disabled).toMatchObject({ exitCode: 1, body: { code: 'webhook_disabled', status: 409, retryable: false } });
    expect(describeError('webhook set', new AgntApiError(403, 'own agent only', 'pair_bound_key')).body.hint).toMatch(/Leave out --assistant/);
  });

  it('a server with no webhook routes yet says so, never "no webhook yet" or "the network is off"', () => {
    for (const verb of ['webhook set', 'webhook show', 'webhook remove', 'webhook test']) {
      const hint = describeError(verb, new AgntApiError(404, 'Route not found', 'not_found')).body.hint!;
      expect(hint).toContain(`doesn't offer \`network ${verb}\` yet`);
      expect(hint).not.toMatch(/no webhook yet|isn't on for this app/);
    }
    expect(describeError('sent', new AgntApiError(404, 'x', 'not_found')).body.hint).toMatch(/No message with that id/);
  });
});
