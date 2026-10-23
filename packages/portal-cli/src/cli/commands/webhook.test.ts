import { describe, it, expect, vi } from 'vitest';
import { agntWebhookSet, agntWebhookShow, agntWebhookRemove, agntWebhookTest } from './webhook.js';
import { AgntUsageError, describeError, type WaitClock } from './agnt.js';
import { AgntResource } from '../../resources/AgntResource.js';
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
    const agnt = new AgntResource(http);
    await agnt.setWebhook('https://agent.example.test/push');
    await agnt.setWebhook('https://agent.example.test/push', { rotateSecret: true, assistant: 'as1' });
    await agnt.getWebhook();
    await agnt.removeWebhook();
    await agnt.testWebhook();
    await agnt.testWebhook({ assistant: 'as 1' });
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

describe('agnt webhook', () => {
  it('set needs --url', async () => {
    await expect(agntWebhookSet({ agnt: {} } as any, {})).rejects.toBeInstanceOf(AgntUsageError);
  });

  it('set shows the secret once, with how to keep it; a replaced URL has no secret and no note', async () => {
    const setWebhook = vi.fn()
      .mockResolvedValueOnce({ webhook: hook(), secret: 'whsec_test' })
      .mockResolvedValueOnce({ webhook: hook() });
    const c = { agnt: { setWebhook } } as any;
    const made = (await agntWebhookSet(c, { url: ' https://agent.example.test/push ', rotate: false }) as any).result;
    expect(made.secret).toBe('whsec_test');
    expect(made.storeSecret).toMatch(/shown only now.*never put it in a message.*--rotate/);
    expect(setWebhook).toHaveBeenCalledWith('https://agent.example.test/push', { rotateSecret: false, assistant: undefined });
    const replaced = (await agntWebhookSet(c, { url: 'https://agent.example.test/push' }) as any).result;
    expect(replaced).toEqual({ webhook: hook() });
  });

  it('show and remove pass the answer through', async () => {
    const c = { agnt: { getWebhook: vi.fn().mockResolvedValue({ webhook: hook() }), removeWebhook: vi.fn().mockResolvedValue({ status: 'removed' }) } } as any;
    expect((await agntWebhookShow(c, {})).result).toEqual({ webhook: hook() });
    expect((await agntWebhookRemove(c, {})).result).toEqual({ status: 'removed' });
  });

  it('test reports its own push once it lands, ignoring an older delivery', async () => {
    const older = { at: '2026-10-20T14:50:00.000Z', kind: 'message', ok: true, httpStatus: 200 };
    const mine = { at: '2026-10-20T15:00:03.000Z', kind: 'test', ok: true, httpStatus: 204 };
    const getWebhook = vi.fn().mockResolvedValueOnce({ webhook: hook(older) }).mockResolvedValue({ webhook: hook(mine) });
    const c = { agnt: { testWebhook: vi.fn().mockResolvedValue({ queued: true }), getWebhook } } as any;
    const out = await agntWebhookTest(c, {}, fakeClock()) as any;
    expect(out).toEqual({ result: { queued: true, delivery: mine }, exitCode: 0 });
  });

  it('reads lastTest, which message pushes never overwrite, over lastDelivery', async () => {
    const mine = { at: '2026-10-20T15:00:02.000Z', kind: 'test', ok: true, httpStatus: 200 };
    const racing = { at: '2026-10-20T15:00:03.000Z', kind: 'message', ok: false, httpStatus: 500, error: 'http_500' };
    const c = { agnt: { testWebhook: vi.fn().mockResolvedValue({ queued: true }), getWebhook: vi.fn().mockResolvedValue({ webhook: { ...hook(racing), lastTest: mine } }) } } as any;
    expect(await agntWebhookTest(c, {}, fakeClock())).toEqual({ result: { queued: true, delivery: mine }, exitCode: 0 });
  });

  it('a lastTest from before this request does not count', async () => {
    const stale = { at: '2026-10-20T14:00:00.000Z', kind: 'test', ok: true, httpStatus: 200 };
    const c = { agnt: { testWebhook: vi.fn().mockResolvedValue({ queued: true }), getWebhook: vi.fn().mockResolvedValue({ webhook: { ...hook(null), lastTest: stale } }) } } as any;
    expect((await agntWebhookTest(c, { waitSeconds: 4 }, fakeClock()) as any).result.delivery).toBeNull();
  });

  it('a test push the receiver refused exits 1 with a hint', async () => {
    const failed = { at: '2026-10-20T15:00:02.000Z', kind: 'test', ok: false, httpStatus: 500, error: 'http_500' };
    const c = { agnt: { testWebhook: vi.fn().mockResolvedValue({ queued: true }), getWebhook: vi.fn().mockResolvedValue({ webhook: hook(failed) }) } } as any;
    const out = await agntWebhookTest(c, {}, fakeClock()) as any;
    expect(out.exitCode).toBe(1);
    expect(out.result.hint).toMatch(/answers 2xx quickly/);
  });

  it('no outcome within the wait: says to check show later', async () => {
    const c = { agnt: { testWebhook: vi.fn().mockResolvedValue({ queued: true }), getWebhook: vi.fn().mockResolvedValue({ webhook: hook(null) }) } } as any;
    const out = await agntWebhookTest(c, { waitSeconds: 6 }, fakeClock()) as any;
    expect(out.result).toMatchObject({ queued: true, delivery: null, note: expect.stringMatching(/agnt webhook show/) });
    expect(c.agnt.getWebhook).toHaveBeenCalledTimes(3);
  });

  it('maps the webhook refusals plainly', () => {
    expect(describeError('webhook', new AgntApiError(400, 'x', 'invalid_url')).body.hint).toMatch(/https on port 443/);
    expect(describeError('webhook', new AgntApiError(400, 'x', 'url_not_public')).body.hint).toMatch(/public host/);
    expect(describeError('webhook', new AgntApiError(409, 'x', 'webhook_disabled')).body.hint).toMatch(/turn it back on/);
    expect(describeError('webhook', new AgntApiError(404, 'x', 'not_found')).body.hint).toMatch(/no webhook yet/);
    expect(describeError('sent', new AgntApiError(404, 'x', 'not_found')).body.hint).toMatch(/No message with that id/);
  });
});
