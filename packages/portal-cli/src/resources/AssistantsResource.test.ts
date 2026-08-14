import { describe, it, expect, vi } from 'vitest';
import { AssistantsResource } from './AssistantsResource.js';
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

describe('AssistantsResource', () => {
  it('list() unwraps { assistants }', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ assistants: [{ id: 'a1' }] }) });
    expect(await new AssistantsResource(http).list()).toEqual([{ id: 'a1' }]);
    expect(http.get).toHaveBeenCalledWith('/assistants');
  });

  it('get()/create()/update() unwrap { assistant }', async () => {
    const http = fakeHttp({
      get: vi.fn().mockResolvedValue({ assistant: { id: 'a1' } }),
      post: vi.fn().mockResolvedValue({ assistant: { id: 'a2', name: 'Robin' } }),
      put: vi.fn().mockResolvedValue({ assistant: { id: 'a1', name: 'Robin Updated' } })
    });
    const resource = new AssistantsResource(http);

    expect(await resource.get('a1')).toEqual({ id: 'a1' });

    const created = await resource.create({ name: 'Robin' } as any);
    expect(http.post).toHaveBeenCalledWith('/assistants', { name: 'Robin' });
    expect(created).toEqual({ id: 'a2', name: 'Robin' });

    const updated = await resource.update('a1', { name: 'Robin Updated' } as any);
    expect(http.put).toHaveBeenCalledWith('/assistants/a1', { name: 'Robin Updated' });
    expect(updated).toEqual({ id: 'a1', name: 'Robin Updated' });
  });

  it('delete() DELETEs /assistants/:id', async () => {
    const http = fakeHttp({ delete: vi.fn().mockResolvedValue(undefined) });
    await new AssistantsResource(http).delete('a1');
    expect(http.delete).toHaveBeenCalledWith('/assistants/a1');
  });

  it('generate() GETs /assistants/generate and returns the bare (unwrapped) result', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ name: 'Robin', emails: ['robin@agnt.ai'] }) });
    const result = await new AssistantsResource(http).generate('Robin');
    expect(http.get).toHaveBeenCalledWith('/assistants/generate', { name: 'Robin' });
    expect(result).toEqual({ name: 'Robin', emails: ['robin@agnt.ai'] });
  });

  it('generate() omits the name param entirely when not given', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ name: 'x', emails: [] }) });
    await new AssistantsResource(http).generate();
    expect(http.get).toHaveBeenCalledWith('/assistants/generate', undefined);
  });
});
