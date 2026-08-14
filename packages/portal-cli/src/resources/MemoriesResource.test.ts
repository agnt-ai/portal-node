import { describe, it, expect, vi } from 'vitest';
import { MemoriesResource } from './MemoriesResource.js';
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

describe('MemoriesResource', () => {
  it('list() stops after a short page (fewer than perPage results)', async () => {
    const get = vi.fn().mockResolvedValue({ memories: [{ id: 'm1' }, { id: 'm2' }], total: 2 });
    const memories = await new MemoriesResource(fakeHttp({ get })).list();

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/memories', { page: 1, perPage: 100 });
    expect(memories).toEqual([{ id: 'm1' }, { id: 'm2' }]);
  });

  it('list() pages through full pages until a short page or total is reached', async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({ id: `m${i}` }));
    const get = vi.fn()
      .mockResolvedValueOnce({ memories: fullPage, total: 150 })
      .mockResolvedValueOnce({ memories: fullPage.slice(0, 50), total: 150 });

    const memories = await new MemoriesResource(fakeHttp({ get })).list();

    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenNthCalledWith(1, '/memories', { page: 1, perPage: 100 });
    expect(get).toHaveBeenNthCalledWith(2, '/memories', { page: 2, perPage: 100 });
    expect(memories).toHaveLength(150);
  });

  it('list() passes tags as a query param when given', async () => {
    const get = vi.fn().mockResolvedValue({ memories: [], total: 0 });
    await new MemoriesResource(fakeHttp({ get })).list('travel');
    expect(get).toHaveBeenCalledWith('/memories', { page: 1, perPage: 100, tags: 'travel' });
  });

  it('list() stops after MAX_PAGES even if the server keeps claiming more (runaway guard)', async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({ id: `m${i}` }));
    const get = vi.fn().mockResolvedValue({ memories: fullPage, total: 1_000_000 });

    const memories = await new MemoriesResource(fakeHttp({ get })).list();

    expect(get).toHaveBeenCalledTimes(20); // MAX_PAGES
    expect(memories).toHaveLength(2000);
  });

  it('get()/create()/update() unwrap { memory }', async () => {
    const http = fakeHttp({
      get: vi.fn().mockResolvedValue({ memory: { id: 'm1', content: 'x' } }),
      post: vi.fn().mockResolvedValue({ memory: { id: 'm2', content: 'y' } }),
      put: vi.fn().mockResolvedValue({ memory: { id: 'm1', content: 'z' } })
    });
    const resource = new MemoriesResource(http);

    expect(await resource.get('m1')).toEqual({ id: 'm1', content: 'x' });
    expect(http.get).toHaveBeenCalledWith('/memories/m1');

    expect(await resource.create({ content: 'y' })).toEqual({ id: 'm2', content: 'y' });
    expect(http.post).toHaveBeenCalledWith('/memories', { content: 'y' });

    expect(await resource.update('m1', { content: 'z' })).toEqual({ id: 'm1', content: 'z' });
    expect(http.put).toHaveBeenCalledWith('/memories/m1', { content: 'z' });
  });

  it('delete() DELETEs /memories/:id', async () => {
    const http = fakeHttp({ delete: vi.fn().mockResolvedValue(undefined) });
    await new MemoriesResource(http).delete('m1');
    expect(http.delete).toHaveBeenCalledWith('/memories/m1');
  });
});
