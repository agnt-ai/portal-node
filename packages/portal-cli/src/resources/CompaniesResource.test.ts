import { describe, it, expect, vi } from 'vitest';
import { CompaniesResource } from './CompaniesResource.js';
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

describe('CompaniesResource', () => {
  it('list() joins array tags into a comma list and unwraps { companies }', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ companies: [{ id: 'co1' }], total: 1, page: 1, perPage: 50 }) });
    const result = await new CompaniesResource(http).list({ tags: ['vip', 'lead'], domain: 'acme.com' });
    expect(http.get).toHaveBeenCalledWith('/companies', { tags: 'vip,lead', domain: 'acme.com' });
    expect(result).toEqual({ companies: [{ id: 'co1' }], total: 1, page: 1, perPage: 50 });
  });

  it('search() hits /companies/search and unwraps { companies }', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ companies: [{ id: 'co1' }] }) });
    const result = await new CompaniesResource(http).search('acme', 10);
    expect(http.get).toHaveBeenCalledWith('/companies/search', { q: 'acme', limit: 10 });
    expect(result).toEqual([{ id: 'co1' }]);
  });

  it('get()/update() unwrap { company }', async () => {
    const http = fakeHttp({
      get: vi.fn().mockResolvedValue({ company: { id: 'co1' } }),
      put: vi.fn().mockResolvedValue({ company: { id: 'co1', name: 'Acme' } })
    });
    const resource = new CompaniesResource(http);
    expect(await resource.get('co1')).toEqual({ id: 'co1' });
    expect(await resource.update('co1', { name: 'Acme' } as any)).toEqual({ id: 'co1', name: 'Acme' });
    expect(http.put).toHaveBeenCalledWith('/companies/co1', { name: 'Acme' });
  });

  it('create() posts to /companies and unwraps { company }', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue({ company: { id: 'co1' } }) });
    const result = await new CompaniesResource(http).create({ name: 'Acme' } as any);
    expect(http.post).toHaveBeenCalledWith('/companies', { name: 'Acme' });
    expect(result).toEqual({ id: 'co1' });
  });

  it('findOrCreate() posts to /companies/find-or-create, distinct from create() — includes created/alreadyExists', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue({ company: { id: 'co1', name: 'Acme', created: false, alreadyExists: true } }) });
    const result = await new CompaniesResource(http).findOrCreate({ domain: 'acme.com' });
    expect(http.post).toHaveBeenCalledWith('/companies/find-or-create', { domain: 'acme.com' });
    expect(result).toEqual({ id: 'co1', name: 'Acme', created: false, alreadyExists: true });
  });

  it('delete() DELETEs /companies/:id', async () => {
    const http = fakeHttp({ delete: vi.fn().mockResolvedValue(undefined) });
    await new CompaniesResource(http).delete('co1');
    expect(http.delete).toHaveBeenCalledWith('/companies/co1');
  });

  it('enrich() PUTs /companies/:id/enrich (org-admin/service only) and unwraps { company }', async () => {
    const http = fakeHttp({ put: vi.fn().mockResolvedValue({ company: { id: 'co1', description: 'A company' } }) });
    const result = await new CompaniesResource(http).enrich('co1', { description: 'A company', descriptionSource: 'web' });
    expect(http.put).toHaveBeenCalledWith('/companies/co1/enrich', { description: 'A company', descriptionSource: 'web' });
    expect(result).toEqual({ id: 'co1', description: 'A company' });
  });

  it('listContacts() unwraps { contacts }', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ contacts: [{ id: 'c1' }] }) });
    const result = await new CompaniesResource(http).listContacts('co1');
    expect(http.get).toHaveBeenCalledWith('/companies/co1/contacts');
    expect(result).toEqual([{ id: 'c1' }]);
  });

  it('bulkTag() posts { ids, add, remove } to /companies/bulk-tag', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue({ bulkTag: { updated: 2 } }) });
    const result = await new CompaniesResource(http).bulkTag(['co1', 'co2'], { add: ['vip'], remove: ['cold'] });
    expect(http.post).toHaveBeenCalledWith('/companies/bulk-tag', { ids: ['co1', 'co2'], add: ['vip'], remove: ['cold'] });
    expect(result).toEqual({ updated: 2 });
  });
});
