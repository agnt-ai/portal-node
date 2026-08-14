import { describe, it, expect, vi } from 'vitest';
import { HandoffResource } from './HandoffResource.js';
import type { HttpClient } from '../HttpClient.js';

function fakeHttp(overrides: Partial<HttpClient> = {}): HttpClient {
  return { get: vi.fn(), post: vi.fn(), ...overrides } as unknown as HttpClient;
}

describe('HandoffResource', () => {
  it('listActive() prefers the plural { handoffs } list', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ ok: true, handoffs: [{ id: 'h1' }, { id: 'h2' }], handoff: { id: 'h2' } }) });
    const result = await new HandoffResource(http).listActive();
    expect(http.get).toHaveBeenCalledWith('/workspace/handoff/active');
    expect(result).toEqual([{ id: 'h1' }, { id: 'h2' }]);
  });

  it('listActive() falls back to the singular { handoff } field for back-compat', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ ok: true, handoff: { id: 'h1' } }) });
    const result = await new HandoffResource(http).listActive();
    expect(result).toEqual([{ id: 'h1' }]);
  });

  it('getActive() returns the newest (last) of the active list, or null', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ ok: true, handoffs: [{ id: 'h1' }, { id: 'h2' }] }) });
    expect(await new HandoffResource(http).getActive()).toEqual({ id: 'h2' });

    const empty = fakeHttp({ get: vi.fn().mockResolvedValue({ ok: true, handoffs: [] }) });
    expect(await new HandoffResource(empty).getActive()).toBeNull();
  });

  it('resolve() posts { items }', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue(undefined) });
    await new HandoffResource(http).resolve([{ handoffId: 'h1', outcome: 'completed' }]);
    expect(http.post).toHaveBeenCalledWith('/workspace/handoff/resolve', { items: [{ handoffId: 'h1', outcome: 'completed' }] });
  });

  it('startSession() unwraps { sessionUrl }, complete() unwraps { taskId }', async () => {
    const http = fakeHttp({
      post: vi.fn()
        .mockResolvedValueOnce({ ok: true, sessionUrl: 'https://session.example.com/x' })
        .mockResolvedValueOnce({ ok: true, taskId: 't1' }),
    });
    const resource = new HandoffResource(http);
    expect(await resource.startSession('h1')).toBe('https://session.example.com/x');
    expect(http.post).toHaveBeenCalledWith('/workspace/handoff/h1/session', undefined);
    expect(await resource.complete('h1')).toBe('t1');
    expect(http.post).toHaveBeenCalledWith('/workspace/handoff/h1/complete', undefined);
  });

  it('defer() omits deferMinutes from the body when not given', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue(undefined) });
    const resource = new HandoffResource(http);
    await resource.defer('h1', 'not now');
    expect(http.post).toHaveBeenCalledWith('/workspace/handoff/h1/defer', { message: 'not now' });
    await resource.defer('h1', 'in an hour', 60);
    expect(http.post).toHaveBeenCalledWith('/workspace/handoff/h1/defer', { message: 'in an hour', deferMinutes: 60 });
  });

  it('decline() posts with no body', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue(undefined) });
    await new HandoffResource(http).decline('h1');
    expect(http.post).toHaveBeenCalledWith('/workspace/handoff/h1/decline', undefined);
  });

  it('launchBrowser() unwraps { handoffId, status }', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue({ ok: true, handoffId: 'h3', status: 'starting' }) });
    const result = await new HandoffResource(http).launchBrowser();
    expect(http.post).toHaveBeenCalledWith('/workspace/handoff/launch', undefined);
    expect(result).toEqual({ handoffId: 'h3', status: 'starting' });
  });
});
