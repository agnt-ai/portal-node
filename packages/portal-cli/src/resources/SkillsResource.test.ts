import { describe, it, expect, vi } from 'vitest';
import { SkillsResource } from './SkillsResource.js';
import type { HttpClient } from '../HttpClient.js';

function fakeHttp(overrides: Partial<HttpClient> = {}): HttpClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    ...overrides
  } as unknown as HttpClient;
}

describe('SkillsResource', () => {
  it('list() unwraps { skills }', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ skills: [{ id: 's1' }] }) });
    const skills = await new SkillsResource(http).list({ kind: 'mcp' });
    expect(http.get).toHaveBeenCalledWith('/skills', { kind: 'mcp' });
    expect(skills).toEqual([{ id: 's1' }]);
  });

  it('get()/create()/update() unwrap { skill }', async () => {
    const http = fakeHttp({
      get: vi.fn().mockResolvedValue({ skill: { id: 's1' } }),
      post: vi.fn().mockResolvedValue({ skill: { id: 's2', name: 'x' } }),
      patch: vi.fn().mockResolvedValue({ skill: { id: 's1', name: 'y' } })
    });
    const resource = new SkillsResource(http);

    expect(await resource.get('s1')).toEqual({ id: 's1' });

    const created = await resource.create({ name: 'x' });
    expect(http.post).toHaveBeenCalledWith('/skills', { name: 'x' });
    expect(created).toEqual({ id: 's2', name: 'x' });

    const updated = await resource.update('s1', { name: 'y' });
    expect(http.patch).toHaveBeenCalledWith('/skills/s1', { name: 'y' });
    expect(updated).toEqual({ id: 's1', name: 'y' });
  });

  it('delete() DELETEs /skills/:id', async () => {
    const http = fakeHttp({ delete: vi.fn().mockResolvedValue(undefined) });
    await new SkillsResource(http).delete('s1');
    expect(http.delete).toHaveBeenCalledWith('/skills/s1');
  });

  it('runNow() unwraps { task }', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue({ task: { id: 't1' } }) });
    const task = await new SkillsResource(http).runNow('s1');
    expect(http.post).toHaveBeenCalledWith('/skills/s1/run');
    expect(task).toEqual({ id: 't1' });
  });

  it('getInstall()/updateInstall() unwrap envelope key "skill", NOT "install" (verified against the controller, initially guessed wrong)', async () => {
    const http = fakeHttp({
      get: vi.fn().mockResolvedValue({ skill: { id: 's1', install: { id: 'i1' } } }),
      patch: vi.fn().mockResolvedValue({ skill: { id: 's1', install: { id: 'i1', enabled: false } } })
    });
    const resource = new SkillsResource(http);

    const got = await resource.getInstall('i1');
    expect(http.get).toHaveBeenCalledWith('/skills/installs/i1');
    expect(got).toEqual({ id: 's1', install: { id: 'i1' } });

    const updated = await resource.updateInstall('i1', { enabled: false });
    expect(http.patch).toHaveBeenCalledWith('/skills/installs/i1', { enabled: false });
    expect(updated).toEqual({ id: 's1', install: { id: 'i1', enabled: false } });
  });

  it('deleteInstall() DELETEs /skills/installs/:id', async () => {
    const http = fakeHttp({ delete: vi.fn().mockResolvedValue(undefined) });
    await new SkillsResource(http).deleteInstall('i1');
    expect(http.delete).toHaveBeenCalledWith('/skills/installs/i1');
  });
});
