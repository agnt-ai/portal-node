import { describe, it, expect, vi } from 'vitest';
import { SkillStoreResource } from './SkillStoreResource.js';
import type { HttpClient } from '../HttpClient.js';

function fakeHttp(overrides: Partial<HttpClient> = {}): HttpClient {
  return { get: vi.fn(), post: vi.fn(), delete: vi.fn(), ...overrides } as unknown as HttpClient;
}

describe('SkillStoreResource', () => {
  it('browse() returns the flat { skills, total, page, totalPages } response', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ ok: true, skills: [{ id: 's1' }], total: 1, page: 1, totalPages: 1 }) });
    const result = await new SkillStoreResource(http).browse({ tier: 'community' });
    expect(http.get).toHaveBeenCalledWith('/skills/store', { tier: 'community' });
    expect(result.skills).toEqual([{ id: 's1' }]);
  });

  it('get() unwraps { skill }', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ skill: { id: 's1' } }) });
    const result = await new SkillStoreResource(http).get('acme', 'notion');
    expect(http.get).toHaveBeenCalledWith('/skills/store/acme/notion');
    expect(result).toEqual({ id: 's1' });
  });

  it('install()/uninstall() hit POST/DELETE .../use', async () => {
    const http = fakeHttp({
      post: vi.fn().mockResolvedValue({ ok: true, installId: 'i1' }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
    });
    const resource = new SkillStoreResource(http);
    expect(await resource.install('acme', 'notion')).toEqual({ ok: true, installId: 'i1' });
    expect(http.post).toHaveBeenCalledWith('/skills/store/acme/notion/use', undefined);
    await resource.uninstall('acme', 'notion');
    expect(http.delete).toHaveBeenCalledWith('/skills/store/acme/notion/use');
  });

  it('requestAccess() posts { message } to .../request', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue({ ok: true, installId: 'i1', status: 'requested' }) });
    const result = await new SkillStoreResource(http).requestAccess('acme', 'notion', 'need this for my role');
    expect(http.post).toHaveBeenCalledWith('/skills/store/acme/notion/request', { message: 'need this for my role' });
    expect(result.status).toBe('requested');
  });

  it('getPermissions() unwraps { permissions }', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ permissions: { canBrowseStore: true } }) });
    const result = await new SkillStoreResource(http).getPermissions();
    expect(http.get).toHaveBeenCalledWith('/skills/store/permissions');
    expect(result).toEqual({ canBrowseStore: true });
  });

  it('myAccess()/listIncomingRequests() unwrap { items }/{ requests }', async () => {
    const http = fakeHttp({
      get: vi.fn()
        .mockResolvedValueOnce({ ok: true, items: [{ installId: 'i1' }] })
        .mockResolvedValueOnce({ ok: true, requests: [{ installId: 'i2' }] }),
    });
    const resource = new SkillStoreResource(http);
    expect(await resource.myAccess()).toEqual([{ installId: 'i1' }]);
    expect(http.get).toHaveBeenCalledWith('/skills/store/my-access');
    expect(await resource.listIncomingRequests()).toEqual([{ installId: 'i2' }]);
    expect(http.get).toHaveBeenCalledWith('/skills/store/requests/incoming');
  });

  it('approveRequest()/declineRequest() post to their respective paths', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue({ ok: true, installId: 'i1' }) });
    const resource = new SkillStoreResource(http);
    await resource.approveRequest('i1');
    expect(http.post).toHaveBeenCalledWith('/skills/store/requests/i1/approve', undefined);
    await resource.declineRequest('i1');
    expect(http.post).toHaveBeenCalledWith('/skills/store/requests/i1/decline', undefined);
  });
});
