import { describe, it, expect, vi } from 'vitest';
import { TagsResource } from './TagsResource.js';
import type { HttpClient } from '../HttpClient.js';

function fakeHttp(overrides: Partial<HttpClient> = {}): HttpClient {
  return { get: vi.fn(), ...overrides } as unknown as HttpClient;
}

describe('TagsResource', () => {
  it('list() unwraps { tags } and passes through params', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ tags: ['vip', 'lead'] }) });
    const tags = await new TagsResource(http).list({ kind: 'contact', prefix: 'v', limit: 10 });
    expect(http.get).toHaveBeenCalledWith('/tags', { kind: 'contact', prefix: 'v', limit: 10 });
    expect(tags).toEqual(['vip', 'lead']);
  });

  it('list() returns an empty array when { tags } is absent', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({}) });
    expect(await new TagsResource(http).list()).toEqual([]);
  });
});
