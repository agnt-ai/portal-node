import { describe, it, expect, vi } from 'vitest';
import { InboxThreadsResource } from './InboxThreadsResource.js';
import type { HttpClient } from '../HttpClient.js';

function fakeHttp(overrides: Partial<HttpClient> = {}): HttpClient {
  return { get: vi.fn(), patch: vi.fn(), delete: vi.fn(), ...overrides } as unknown as HttpClient;
}

describe('InboxThreadsResource', () => {
  it('list() unwraps the paged { threads } envelope', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ threads: [{ id: 't1' }], total: 1, page: 1, perPage: 50 }) });
    const result = await new InboxThreadsResource(http).list({ assistantId: 'a1', status: 'active' });
    expect(http.get).toHaveBeenCalledWith('/inbox/threads', { assistantId: 'a1', status: 'active' });
    expect(result).toEqual({ threads: [{ id: 't1' }], total: 1, page: 1, perPage: 50 });
  });

  it('listEmails() unwraps { emails }', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ emails: [{ id: 'e1' }] }) });
    const result = await new InboxThreadsResource(http).listEmails('t1');
    expect(http.get).toHaveBeenCalledWith('/inbox/threads/t1/emails');
    expect(result).toEqual([{ id: 'e1' }]);
  });

  it('update() PATCHes /inbox/threads/:id with only { status }', async () => {
    const http = fakeHttp({ patch: vi.fn().mockResolvedValue({ ok: true, id: 't1', status: 'archived' }) });
    const result = await new InboxThreadsResource(http).update('t1', 'archived');
    expect(http.patch).toHaveBeenCalledWith('/inbox/threads/t1', { status: 'archived' });
    expect(result).toEqual({ ok: true, id: 't1', status: 'archived' });
  });

  it('delete() soft-deletes the thread', async () => {
    const http = fakeHttp({ delete: vi.fn().mockResolvedValue({ ok: true, id: 't1' }) });
    const result = await new InboxThreadsResource(http).delete('t1');
    expect(http.delete).toHaveBeenCalledWith('/inbox/threads/t1');
    expect(result).toEqual({ ok: true, id: 't1' });
  });
});
