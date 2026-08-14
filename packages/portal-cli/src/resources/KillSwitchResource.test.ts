import { describe, it, expect, vi } from 'vitest';
import { KillSwitchResource } from './KillSwitchResource.js';
import type { HttpClient } from '../HttpClient.js';

function fakeHttp(overrides: Partial<HttpClient> = {}): HttpClient {
  return { get: vi.fn(), post: vi.fn(), ...overrides } as unknown as HttpClient;
}

describe('KillSwitchResource', () => {
  it('get() returns the raw snapshot (no envelope wrapper)', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ state: 'active', engagedAt: null, engagedBy: null, autoTrigger: null, reason: null }) });
    const snapshot = await new KillSwitchResource(http).get();
    expect(http.get).toHaveBeenCalledWith('/account/kill-switch');
    expect(snapshot.state).toBe('active');
  });

  it('freeze()/release() are thin wrappers over update() with the right action', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue({ state: 'frozen' }) });
    const resource = new KillSwitchResource(http);

    await resource.freeze('runaway loop');
    expect(http.post).toHaveBeenCalledWith('/account/kill-switch', { action: 'freeze', reason: 'runaway loop' });

    await resource.release();
    expect(http.post).toHaveBeenCalledWith('/account/kill-switch', { action: 'release' });
  });
});
