import { describe, it, expect, vi } from 'vitest';
import { BookingLinksResource } from './BookingLinksResource.js';
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

describe('BookingLinksResource', () => {
  it('list() unwraps { bookingLinks }', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ bookingLinks: [{ id: 'b1' }] }) });
    expect(await new BookingLinksResource(http).list()).toEqual([{ id: 'b1' }]);
    expect(http.get).toHaveBeenCalledWith('/booking-links');
  });

  it('get()/create()/update() unwrap { bookingLink }', async () => {
    const http = fakeHttp({
      get: vi.fn().mockResolvedValue({ bookingLink: { id: 'b1' } }),
      post: vi.fn().mockResolvedValue({ bookingLink: { id: 'b2', slug: 'intro' } }),
      put: vi.fn().mockResolvedValue({ bookingLink: { id: 'b1', slug: 'updated' } })
    });
    const resource = new BookingLinksResource(http);

    expect(await resource.get('b1')).toEqual({ id: 'b1' });

    const created = await resource.create({ slug: 'intro' } as any);
    expect(http.post).toHaveBeenCalledWith('/booking-links', { slug: 'intro' });
    expect(created).toEqual({ id: 'b2', slug: 'intro' });

    const updated = await resource.update('b1', { slug: 'updated' } as any);
    expect(http.put).toHaveBeenCalledWith('/booking-links/b1', { slug: 'updated' });
    expect(updated).toEqual({ id: 'b1', slug: 'updated' });
  });

  it('delete() DELETEs /booking-links/:id', async () => {
    const http = fakeHttp({ delete: vi.fn().mockResolvedValue(undefined) });
    await new BookingLinksResource(http).delete('b1');
    expect(http.delete).toHaveBeenCalledWith('/booking-links/b1');
  });
});
