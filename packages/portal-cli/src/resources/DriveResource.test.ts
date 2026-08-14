import { describe, it, expect, vi } from 'vitest';
import { DriveResource } from './DriveResource.js';
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

describe('DriveResource', () => {
  it('hits /drive-files, NOT /drive — the real backend path, not the portal proxy\'s /api/drive alias', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ driveFiles: [{ id: 'f1' }], total: 1, page: 1, perPage: 50 }) });
    const result = await new DriveResource(http).list({ tags: ['a', 'b'] });
    expect(http.get).toHaveBeenCalledWith('/drive-files', { tags: 'a,b' });
    expect(result).toEqual({ driveFiles: [{ id: 'f1' }], total: 1, page: 1, perPage: 50 });
  });

  it('get() unwraps { driveFile }', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ driveFile: { id: 'f1' } }) });
    expect(await new DriveResource(http).get('f1')).toEqual({ id: 'f1' });
    expect(http.get).toHaveBeenCalledWith('/drive-files/f1');
  });

  it('getDownloadUrl() unwraps { url }', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ ok: true, url: 'https://s3.example/presigned' }) });
    const url = await new DriveResource(http).getDownloadUrl('f1');
    expect(http.get).toHaveBeenCalledWith('/drive-files/f1/download');
    expect(url).toBe('https://s3.example/presigned');
  });

  it('rename() PATCHes { name } and unwraps { driveFile }', async () => {
    const http = fakeHttp({ patch: vi.fn().mockResolvedValue({ driveFile: { id: 'f1', name: 'New name' } }) });
    const file = await new DriveResource(http).rename('f1', 'New name');
    expect(http.patch).toHaveBeenCalledWith('/drive-files/f1', { name: 'New name' });
    expect(file).toEqual({ id: 'f1', name: 'New name' });
  });

  it('move() PATCHes /move with { folder }, allowing null to move to root', async () => {
    const http = fakeHttp({ patch: vi.fn().mockResolvedValue({ driveFile: { id: 'f1' } }) });
    const resource = new DriveResource(http);
    await resource.move('f1', 'folder1');
    expect(http.patch).toHaveBeenCalledWith('/drive-files/f1/move', { folder: 'folder1' });
    await resource.move('f1', null);
    expect(http.patch).toHaveBeenCalledWith('/drive-files/f1/move', { folder: null });
  });

  it('delete() DELETEs /drive-files/:id', async () => {
    const http = fakeHttp({ delete: vi.fn().mockResolvedValue(undefined) });
    await new DriveResource(http).delete('f1');
    expect(http.delete).toHaveBeenCalledWith('/drive-files/f1');
  });

  it('linkTask()/unlinkTask() hit the linked-task sub-resource', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue(undefined), delete: vi.fn().mockResolvedValue(undefined) });
    const resource = new DriveResource(http);
    await resource.linkTask('f1', 't1');
    expect(http.post).toHaveBeenCalledWith('/drive-files/f1/link-task', { taskId: 't1' });
    await resource.unlinkTask('f1', 't1');
    expect(http.delete).toHaveBeenCalledWith('/drive-files/f1/unlink-task/t1');
  });
});
