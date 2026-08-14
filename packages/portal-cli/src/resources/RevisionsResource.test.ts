import { describe, it, expect, vi } from 'vitest';
import { RevisionsResource } from './RevisionsResource.js';
import type { HttpClient } from '../HttpClient.js';

function fakeHttp(overrides: Partial<HttpClient> = {}): HttpClient {
  return { get: vi.fn(), post: vi.fn(), ...overrides } as unknown as HttpClient;
}

describe('RevisionsResource', () => {
  it('list() hits /:kind/:id/revisions for entity kinds', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ model: 'Contact', parentId: 'c1', count: 0, revisions: [] }) });
    await new RevisionsResource(http).list('contacts', 'c1');
    expect(http.get).toHaveBeenCalledWith('/contacts/c1/revisions');
  });

  it('list() special-cases profile to /me/profile/revisions with no id', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ model: 'User', parentId: 'u1', count: 0, revisions: [] }) });
    await new RevisionsResource(http).list('profile');
    expect(http.get).toHaveBeenCalledWith('/me/profile/revisions');
  });

  it('restore() posts { reason, skipCapture } to /:kind/:id/revisions/:revisionId/restore', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue({ ok: true, model: 'Contact', parentId: 'c1', restoredFrom: 'r1', fieldsRestored: ['name'] }) });
    const result = await new RevisionsResource(http).restore('contacts', 'c1', 'r1', { reason: 'oops', skipCapture: true });
    expect(http.post).toHaveBeenCalledWith('/contacts/c1/revisions/r1/restore', { reason: 'oops', skipCapture: true });
    expect(result.fieldsRestored).toEqual(['name']);
  });

  it('restore() special-cases profile — no id segment in the path', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue({ ok: true }) });
    await new RevisionsResource(http).restore('profile', undefined, 'r1');
    expect(http.post).toHaveBeenCalledWith('/me/profile/revisions/r1/restore', { reason: undefined, skipCapture: undefined });
  });

  it('listForUser() hits /me/revisions with model/authorKind/limit filters', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ count: 0, revisions: [] }) });
    await new RevisionsResource(http).listForUser({ model: 'Contact', authorKind: 'agent', limit: 50 });
    expect(http.get).toHaveBeenCalledWith('/me/revisions', { model: 'Contact', authorKind: 'agent', limit: 50 });
  });
});
