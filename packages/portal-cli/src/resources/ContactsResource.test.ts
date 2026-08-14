import { describe, it, expect, vi } from 'vitest';
import { ContactsResource } from './ContactsResource.js';
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

describe('ContactsResource', () => {
  it('list() joins array sourceType/tags into comma lists and unwraps the paged envelope', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ contacts: [{ id: 'c1' }], total: 1, page: 1, perPage: 50 }) });

    const result = await new ContactsResource(http).list({ sourceType: ['manual', 'import'], tags: ['vip', 'lead'], search: 'jane' });

    expect(http.get).toHaveBeenCalledWith('/contacts', { sourceType: 'manual,import', tags: 'vip,lead', search: 'jane' });
    expect(result).toEqual({ contacts: [{ id: 'c1' }], total: 1, page: 1, perPage: 50 });
  });

  it('get()/update() unwrap { contact }', async () => {
    const http = fakeHttp({
      get: vi.fn().mockResolvedValue({ contact: { id: 'c1' } }),
      put: vi.fn().mockResolvedValue({ contact: { id: 'c1', firstName: 'Ada' } })
    });
    const resource = new ContactsResource(http);
    expect(await resource.get('c1')).toEqual({ id: 'c1' });
    expect(await resource.update('c1', { firstName: 'Ada' } as any)).toEqual({ id: 'c1', firstName: 'Ada' });
    expect(http.put).toHaveBeenCalledWith('/contacts/c1', { firstName: 'Ada' });
  });

  it('create() unwraps either bare Contact or { contact }', async () => {
    const http1 = fakeHttp({ post: vi.fn().mockResolvedValue({ contact: { id: 'c1' } }) });
    expect(await new ContactsResource(http1).create({ firstName: 'Ada' } as any)).toEqual({ id: 'c1' });

    const http2 = fakeHttp({ post: vi.fn().mockResolvedValue({ id: 'c2' }) });
    expect(await new ContactsResource(http2).create({ firstName: 'Bare' } as any)).toEqual({ id: 'c2' });
  });

  it('delete() DELETEs /contacts/:id', async () => {
    const http = fakeHttp({ delete: vi.fn().mockResolvedValue(undefined) });
    await new ContactsResource(http).delete('c1');
    expect(http.delete).toHaveBeenCalledWith('/contacts/c1');
  });

  it('activity() unwraps { activity }', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ activity: { contact: 'c1', events: [] } }) });
    const activity = await new ContactsResource(http).activity('c1');
    expect(http.get).toHaveBeenCalledWith('/contacts/c1/activity');
    expect(activity).toEqual({ contact: 'c1', events: [] });
  });

  it('bulkTag() posts { ids, add, remove } — the REAL shape, not a guessed { contactIds, tags, mode }', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue({ bulkTag: { updated: 2 } }) });
    const result = await new ContactsResource(http).bulkTag(['c1', 'c2'], { add: ['vip'], remove: ['cold'] });
    expect(http.post).toHaveBeenCalledWith('/contacts/bulk-tag', { ids: ['c1', 'c2'], add: ['vip'], remove: ['cold'] });
    expect(result).toEqual({ updated: 2 });
  });
});
