import { describe, it, expect, vi } from 'vitest';
import { TrashResource } from './TrashResource.js';
import type { HttpClient } from '../HttpClient.js';

function fakeHttp(overrides: Partial<HttpClient> = {}): HttpClient {
  return { get: vi.fn(), post: vi.fn(), ...overrides } as unknown as HttpClient;
}

describe('TrashResource', () => {
  it('list() hits /portal/trash/:kind — NOT /trash/:kind (the real prefix, confirmed against portalRoutes.mjs)', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ count: 1, retentionDays: 30, items: [{ id: 's1' }] }) });
    const result = await new TrashResource(http).list('skills');
    expect(http.get).toHaveBeenCalledWith('/portal/trash/skills');
    expect(result.items).toEqual([{ id: 's1' }]);
  });

  it('restore() hits /portal/{kind}/:id/restore — a DIFFERENT prefix per kind, not a generic /trash/:kind/:id/restore', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue({ ok: true, id: 'a1', restoredAt: '2026-01-01' }) });
    const result = await new TrashResource(http).restore('assistants', 'a1');
    expect(http.post).toHaveBeenCalledWith('/portal/assistants/a1/restore');
    expect(result).toEqual({ ok: true, id: 'a1', restoredAt: '2026-01-01' });
  });
});
