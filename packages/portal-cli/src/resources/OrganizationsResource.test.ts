import { describe, it, expect, vi } from 'vitest';
import { OrganizationsResource } from './OrganizationsResource.js';
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

describe('OrganizationsResource', () => {
  it('list() unwraps the paged envelope', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ organizations: [{ id: 'o1' }], total: 1, page: 1, perPage: 50 }) });
    const result = await new OrganizationsResource(http).list();
    expect(http.get).toHaveBeenCalledWith('/organizations', undefined);
    expect(result.organizations).toEqual([{ id: 'o1' }]);
  });

  it('get()/create()/update() unwrap { organization }', async () => {
    const http = fakeHttp({
      get: vi.fn().mockResolvedValue({ organization: { id: 'o1' } }),
      post: vi.fn().mockResolvedValue({ organization: { id: 'o2', name: 'Acme' } }),
      put: vi.fn().mockResolvedValue({ organization: { id: 'o1', name: 'Renamed' } })
    });
    const resource = new OrganizationsResource(http);

    expect(await resource.get('o1')).toEqual({ id: 'o1' });

    const created = await resource.create('Acme');
    expect(http.post).toHaveBeenCalledWith('/organizations', { name: 'Acme' });
    expect(created).toEqual({ id: 'o2', name: 'Acme' });

    const updated = await resource.update('o1', { name: 'Renamed' });
    expect(http.put).toHaveBeenCalledWith('/organizations/o1', { name: 'Renamed' });
    expect(updated).toEqual({ id: 'o1', name: 'Renamed' });
  });

  it('delete() DELETEs /organizations/:id', async () => {
    const http = fakeHttp({ delete: vi.fn().mockResolvedValue(undefined) });
    await new OrganizationsResource(http).delete('o1');
    expect(http.delete).toHaveBeenCalledWith('/organizations/o1');
  });
});
