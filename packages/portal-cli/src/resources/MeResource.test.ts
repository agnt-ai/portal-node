import { describe, it, expect, vi } from 'vitest';
import { MeResource } from './MeResource.js';
import type { HttpClient } from '../HttpClient.js';

function fakeHttp(overrides: Partial<HttpClient> = {}): HttpClient {
  return {
    get: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    ...overrides
  } as unknown as HttpClient;
}

describe('MeResource', () => {
  it('hits /profile, NOT /me — the real backend path despite the "me" naming everywhere else', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ user: { id: 'u1' } }) });
    expect(await new MeResource(http).get()).toEqual({ id: 'u1' });
    expect(http.get).toHaveBeenCalledWith('/profile');
  });

  it('update() PATCHes /profile and unwraps { user }', async () => {
    const http = fakeHttp({ patch: vi.fn().mockResolvedValue({ user: { id: 'u1', firstName: 'Ada' } }) });
    const user = await new MeResource(http).update({ firstName: 'Ada' } as any);
    expect(http.patch).toHaveBeenCalledWith('/profile', { firstName: 'Ada' });
    expect(user).toEqual({ id: 'u1', firstName: 'Ada' });
  });

  it('delete() DELETEs /profile', async () => {
    const http = fakeHttp({ delete: vi.fn().mockResolvedValue(undefined) });
    await new MeResource(http).delete();
    expect(http.delete).toHaveBeenCalledWith('/profile');
  });
});
