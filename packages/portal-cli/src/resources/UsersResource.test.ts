import { describe, it, expect, vi } from 'vitest';
import { UsersResource } from './UsersResource.js';
import type { HttpClient } from '../HttpClient.js';

function fakeHttp(overrides: Partial<HttpClient> = {}): HttpClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    ...overrides
  } as unknown as HttpClient;
}

describe('UsersResource', () => {
  it('list() unwraps the paged { users } envelope', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ users: [{ id: 'u1' }], total: 1, page: 1, perPage: 50 }) });
    const result = await new UsersResource(http).list();
    expect(http.get).toHaveBeenCalledWith('/users', undefined);
    expect(result.users).toEqual([{ id: 'u1' }]);
  });

  it('get()/create()/update() unwrap { user }', async () => {
    const http = fakeHttp({
      get: vi.fn().mockResolvedValue({ user: { id: 'u1' } }),
      post: vi.fn().mockResolvedValue({ user: { id: 'u2', email: 'a@b.com' } }),
      put: vi.fn().mockResolvedValue({ user: { id: 'u1', name: 'Updated' } })
    });
    const resource = new UsersResource(http);

    expect(await resource.get('u1')).toEqual({ id: 'u1' });

    const created = await resource.create({ email: 'a@b.com' } as any);
    expect(http.post).toHaveBeenCalledWith('/users', { email: 'a@b.com' });
    expect(created).toEqual({ id: 'u2', email: 'a@b.com' });

    const updated = await resource.update('u1', { name: 'Updated' } as any);
    expect(http.put).toHaveBeenCalledWith('/users/u1', { name: 'Updated' });
    expect(updated).toEqual({ id: 'u1', name: 'Updated' });
  });

  it('delete() DELETEs /users/:id', async () => {
    const http = fakeHttp({ delete: vi.fn().mockResolvedValue(undefined) });
    await new UsersResource(http).delete('u1');
    expect(http.delete).toHaveBeenCalledWith('/users/u1');
  });
});
