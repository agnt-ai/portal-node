import { describe, it, expect, vi } from 'vitest';
import { ContextsResource } from './ContextsResource.js';
import type { HttpClient } from '../HttpClient.js';

function fakeHttp(overrides: Partial<HttpClient> = {}): HttpClient {
  return { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), ...overrides } as unknown as HttpClient;
}

describe('ContextsResource', () => {
  it('list() unwraps the paged { contexts } envelope', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ contexts: [{ id: 'ctx1' }], total: 1, page: 1, perPage: 50 }) });
    const result = await new ContextsResource(http).list({ resourceType: 'task' });
    expect(http.get).toHaveBeenCalledWith('/contexts', { resourceType: 'task' });
    expect(result).toEqual({ contexts: [{ id: 'ctx1' }], total: 1, page: 1, perPage: 50 });
  });

  it('get()/create()/update() unwrap { context }', async () => {
    const http = fakeHttp({
      get: vi.fn().mockResolvedValue({ context: { id: 'ctx1' } }),
      post: vi.fn().mockResolvedValue({ context: { id: 'ctx1' } }),
      put: vi.fn().mockResolvedValue({ context: { id: 'ctx1', tags: ['x'] } }),
    });
    const resource = new ContextsResource(http);
    expect(await resource.get('ctx1')).toEqual({ id: 'ctx1' });
    expect(await resource.create({ resourceType: 'task', data: {} })).toEqual({ id: 'ctx1' });
    expect(await resource.update('ctx1', { tags: ['x'] })).toEqual({ id: 'ctx1', tags: ['x'] });
    expect(http.put).toHaveBeenCalledWith('/contexts/ctx1', { tags: ['x'] });
  });

  it('delete() DELETEs /contexts/:id', async () => {
    const http = fakeHttp({ delete: vi.fn().mockResolvedValue(undefined) });
    await new ContextsResource(http).delete('ctx1');
    expect(http.delete).toHaveBeenCalledWith('/contexts/ctx1');
  });
});
