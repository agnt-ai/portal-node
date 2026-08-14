import { describe, it, expect, vi } from 'vitest';
import { CalendarBlocksResource } from './CalendarBlocksResource.js';
import type { HttpClient } from '../HttpClient.js';

function fakeHttp(overrides: Partial<HttpClient> = {}): HttpClient {
  return { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), ...overrides } as unknown as HttpClient;
}

describe('CalendarBlocksResource', () => {
  it('list() unwraps { blocks }', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ blocks: [{ id: 'b1' }] }) });
    const result = await new CalendarBlocksResource(http).list('2026-01-01', '2026-01-31');
    expect(http.get).toHaveBeenCalledWith('/calendar-blocks', { startsAt: '2026-01-01', endsAt: '2026-01-31' });
    expect(result).toEqual([{ id: 'b1' }]);
  });

  it('create()/update() unwrap { block }', async () => {
    const http = fakeHttp({
      post: vi.fn().mockResolvedValue({ block: { id: 'b1' } }),
      patch: vi.fn().mockResolvedValue({ block: { id: 'b1', title: 'Focus time' } }),
    });
    const resource = new CalendarBlocksResource(http);
    expect(await resource.create({ startsAt: 's', endsAt: 'e' })).toEqual({ id: 'b1' });
    expect(await resource.update('b1', { title: 'Focus time' })).toEqual({ id: 'b1', title: 'Focus time' });
    expect(http.patch).toHaveBeenCalledWith('/calendar-blocks/b1', { title: 'Focus time' });
  });

  it('delete() DELETEs /calendar-blocks/:id', async () => {
    const http = fakeHttp({ delete: vi.fn().mockResolvedValue(undefined) });
    await new CalendarBlocksResource(http).delete('b1');
    expect(http.delete).toHaveBeenCalledWith('/calendar-blocks/b1');
  });
});
