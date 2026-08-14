import { describe, it, expect, vi } from 'vitest';
import { CartsResource } from './CartsResource.js';
import type { HttpClient } from '../HttpClient.js';

function fakeHttp(overrides: Partial<HttpClient> = {}): HttpClient {
  return { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), ...overrides } as unknown as HttpClient;
}

describe('CartsResource', () => {
  it('listPending() hits /carts?status=pending_approval,time_boxed and unwraps { carts }', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ carts: [{ id: 'cart1' }] }) });
    const result = await new CartsResource(http).listPending();
    expect(http.get).toHaveBeenCalledWith('/carts', { status: 'pending_approval,time_boxed' });
    expect(result).toEqual([{ id: 'cart1' }]);
  });

  it('get() unwraps { cart } and falls back to null', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ cart: null }) });
    const result = await new CartsResource(http).get('cart1');
    expect(http.get).toHaveBeenCalledWith('/carts/cart1');
    expect(result).toBeNull();
  });

  it('approve()/cancel() are flat responses, not envelope-wrapped', async () => {
    const http = fakeHttp({
      post: vi.fn()
        .mockResolvedValueOnce({ ok: true, cartId: 'cart1', status: 'approved' })
        .mockResolvedValueOnce({ ok: true, cartId: 'cart1', status: 'cancelled' }),
    });
    const resource = new CartsResource(http);
    expect(await resource.approve('cart1')).toEqual({ ok: true, cartId: 'cart1', status: 'approved' });
    expect(http.post).toHaveBeenCalledWith('/carts/cart1/approve', {});
    expect(await resource.cancel('cart1', 'changed my mind')).toEqual({ ok: true, cartId: 'cart1', status: 'cancelled' });
    expect(http.post).toHaveBeenCalledWith('/carts/cart1/cancel', { reason: 'changed my mind' });
  });

  it('updateDispatch()/removeDispatch() unwrap { cart } — the REAL shape, not the portal-declared { ok }', async () => {
    const http = fakeHttp({
      patch: vi.fn().mockResolvedValue({ cart: { id: 'cart1', dispatches: [] } }),
      delete: vi.fn().mockResolvedValue({ cart: { id: 'cart1', dispatches: [] } }),
    });
    const resource = new CartsResource(http);
    const patched = await resource.updateDispatch('cart1', 0, { subject: 'New subject' });
    expect(http.patch).toHaveBeenCalledWith('/carts/cart1/dispatches/0', { subject: 'New subject' });
    expect(patched).toEqual({ id: 'cart1', dispatches: [] });
    const removed = await resource.removeDispatch('cart1', 0);
    expect(http.delete).toHaveBeenCalledWith('/carts/cart1/dispatches/0');
    expect(removed).toEqual({ id: 'cart1', dispatches: [] });
  });

  it('undoDispatch() posts to .../undo and returns the flat response', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue({ ok: true, undone: true, type: 'reversed' }) });
    const result = await new CartsResource(http).undoDispatch('cart1', 0);
    expect(http.post).toHaveBeenCalledWith('/carts/cart1/dispatches/0/undo', {});
    expect(result).toEqual({ ok: true, undone: true, type: 'reversed' });
  });

  it('listSnapshots() returns the flat { cartId, count, snapshots } response', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ cartId: 'cart1', count: 1, snapshots: [] }) });
    const result = await new CartsResource(http).listSnapshots('cart1');
    expect(http.get).toHaveBeenCalledWith('/carts/cart1/snapshots');
    expect(result).toEqual({ cartId: 'cart1', count: 1, snapshots: [] });
  });

  it('undoAll() posts to /carts/:id/undo and returns the flat undo-all summary', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue({ ok: true, cartId: 'cart1', undone: 2, skipped: 0, expired: 0, failed: 0, details: [] }) });
    const result = await new CartsResource(http).undoAll('cart1');
    expect(http.post).toHaveBeenCalledWith('/carts/cart1/undo', undefined);
    expect(result.undone).toBe(2);
  });
});
