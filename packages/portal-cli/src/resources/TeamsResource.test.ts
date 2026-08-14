import { describe, it, expect, vi } from 'vitest';
import { TeamsResource } from './TeamsResource.js';
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

describe('TeamsResource', () => {
  it('list() unwraps the paged envelope', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ teams: [{ id: 't1' }], total: 1, page: 1, perPage: 50 }) });
    const result = await new TeamsResource(http).list();
    expect(http.get).toHaveBeenCalledWith('/teams', undefined);
    expect(result).toEqual({ teams: [{ id: 't1' }], total: 1, page: 1, perPage: 50 });
  });

  it('get()/create()/update() unwrap { team }', async () => {
    const http = fakeHttp({
      get: vi.fn().mockResolvedValue({ team: { id: 't1' } }),
      post: vi.fn().mockResolvedValue({ team: { id: 't2', name: 'Sales' } }),
      put: vi.fn().mockResolvedValue({ team: { id: 't1', name: 'Renamed' } })
    });
    const resource = new TeamsResource(http);

    expect(await resource.get('t1')).toEqual({ id: 't1' });

    const created = await resource.create('Sales');
    expect(http.post).toHaveBeenCalledWith('/teams', { name: 'Sales' });
    expect(created).toEqual({ id: 't2', name: 'Sales' });

    const updated = await resource.update('t1', { name: 'Renamed' });
    expect(http.put).toHaveBeenCalledWith('/teams/t1', { name: 'Renamed' });
    expect(updated).toEqual({ id: 't1', name: 'Renamed' });
  });

  it('delete() DELETEs /teams/:id', async () => {
    const http = fakeHttp({ delete: vi.fn().mockResolvedValue(undefined) });
    await new TeamsResource(http).delete('t1');
    expect(http.delete).toHaveBeenCalledWith('/teams/t1');
  });

  it('listMembers() unwraps the paged { members } envelope', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ members: [{ id: 'm1' }], total: 1, page: 1, perPage: 50 }) });
    const result = await new TeamsResource(http).listMembers('t1');
    expect(http.get).toHaveBeenCalledWith('/teams/t1/members', undefined);
    expect(result.members).toEqual([{ id: 'm1' }]);
  });

  it('addMember()/updateMember() unwrap envelope key "member" (verified, not guessed)', async () => {
    const http = fakeHttp({
      post: vi.fn().mockResolvedValue({ member: { id: 'm1', role: 'member' } }),
      put: vi.fn().mockResolvedValue({ member: { id: 'm1', role: 'admin' } })
    });
    const resource = new TeamsResource(http);

    const added = await resource.addMember('t1', 'u1', 'member');
    expect(http.post).toHaveBeenCalledWith('/teams/t1/members', { userId: 'u1', role: 'member', newOwnerId: undefined });
    expect(added).toEqual({ id: 'm1', role: 'member' });

    const updated = await resource.updateMember('t1', 'm1', { role: 'admin' });
    expect(http.put).toHaveBeenCalledWith('/teams/t1/members/m1', { role: 'admin' });
    expect(updated).toEqual({ id: 'm1', role: 'admin' });
  });

  it('removeMember() DELETEs the member sub-resource', async () => {
    const http = fakeHttp({ delete: vi.fn().mockResolvedValue(undefined) });
    await new TeamsResource(http).removeMember('t1', 'm1');
    expect(http.delete).toHaveBeenCalledWith('/teams/t1/members/m1');
  });

  it('transferOwnership() posts newOwnerId', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue(undefined) });
    await new TeamsResource(http).transferOwnership('t1', 'u2');
    expect(http.post).toHaveBeenCalledWith('/teams/t1/transfer-ownership', { newOwnerId: 'u2' });
  });
});
