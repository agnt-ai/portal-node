import { describe, it, expect, vi } from 'vitest';
import { IdentifiersResource } from './IdentifiersResource.js';
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

describe('IdentifiersResource', () => {
  it('list() unwraps { identifiers }', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ identifiers: [{ id: 'i1' }] }) });
    expect(await new IdentifiersResource(http).list()).toEqual([{ id: 'i1' }]);
    expect(http.get).toHaveBeenCalledWith('/identifiers');
  });

  it('get()/create()/update() unwrap { identifier }', async () => {
    const http = fakeHttp({
      get: vi.fn().mockResolvedValue({ identifier: { id: 'i1' } }),
      post: vi.fn().mockResolvedValue({ identifier: { id: 'i2', type: 'email', value: 'a@b.com' } }),
      put: vi.fn().mockResolvedValue({ identifier: { id: 'i1', label: 'Work' } })
    });
    const resource = new IdentifiersResource(http);

    expect(await resource.get('i1')).toEqual({ id: 'i1' });

    const created = await resource.create({ type: 'email', value: 'a@b.com' });
    expect(http.post).toHaveBeenCalledWith('/identifiers', { type: 'email', value: 'a@b.com' });
    expect(created).toEqual({ id: 'i2', type: 'email', value: 'a@b.com' });

    const updated = await resource.update('i1', { label: 'Work' });
    expect(http.put).toHaveBeenCalledWith('/identifiers/i1', { label: 'Work' });
    expect(updated).toEqual({ id: 'i1', label: 'Work' });
  });

  it('delete() DELETEs /identifiers/:id', async () => {
    const http = fakeHttp({ delete: vi.fn().mockResolvedValue(undefined) });
    await new IdentifiersResource(http).delete('i1');
    expect(http.delete).toHaveBeenCalledWith('/identifiers/i1');
  });

  it('makePrimary() POSTs with no body', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue(undefined) });
    await new IdentifiersResource(http).makePrimary('i1');
    expect(http.post).toHaveBeenCalledWith('/identifiers/i1/make-primary');
  });
});
