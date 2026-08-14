import type { HttpClient } from '../HttpClient.js';
import type {
  PendingCart, ApproveCartResponse, CancelCartResponse, UndoDispatchResponse,
  DispatchPatch, SnapshotsResponse, CartUndoAllResult,
} from '../types.js';

/**
 * DispatchCart approval flow — pending/time-boxed carts an assistant is
 * waiting on, their per-dispatch edits, approve/cancel, and undo (per-dispatch
 * or cart-wide). Mirrors agnt-portal's lib/api/carts.ts, but corrects two
 * response shapes it declared wrong: updateDispatch/removeDispatch actually
 * return the full updated `{ cart }`, not `{ ok: boolean }` (verified against
 * portalCartsController.mjs's updateDispatch/deleteDispatch — both call
 * sendResourceResponse(res, 'cart', ...); the portal's own client code just
 * never used the return value, so the wrong declared type never surfaced).
 */
export class CartsResource {
  constructor(private http: HttpClient) {}

  /** Carts awaiting review: status ∈ { pending_approval, time_boxed } by default. */
  async listPending(): Promise<PendingCart[]> {
    const r = await this.http.get<any>('/carts', { status: 'pending_approval,time_boxed' });
    return r.carts ?? [];
  }

  async get(cartId: string): Promise<PendingCart | null> {
    const r = await this.http.get<any>(`/carts/${cartId}`);
    return r.cart ?? null;
  }

  async approve(cartId: string): Promise<ApproveCartResponse> {
    return this.http.post<ApproveCartResponse>(`/carts/${cartId}/approve`, {});
  }

  async cancel(cartId: string, reason?: string): Promise<CancelCartResponse> {
    return this.http.post<CancelCartResponse>(`/carts/${cartId}/cancel`, reason ? { reason } : {});
  }

  /** Real shape: the full updated cart, not `{ ok }` — see class doc. */
  async updateDispatch(cartId: string, dispatchIndex: number, patch: DispatchPatch): Promise<PendingCart> {
    const r = await this.http.patch<any>(`/carts/${cartId}/dispatches/${dispatchIndex}`, patch);
    return r.cart;
  }

  /** Real shape: the full updated cart, not `{ ok }` — see class doc. */
  async removeDispatch(cartId: string, dispatchIndex: number): Promise<PendingCart> {
    const r = await this.http.delete<any>(`/carts/${cartId}/dispatches/${dispatchIndex}`);
    return r.cart;
  }

  async undoDispatch(cartId: string, dispatchIndex: number): Promise<UndoDispatchResponse> {
    return this.http.post<UndoDispatchResponse>(`/carts/${cartId}/dispatches/${dispatchIndex}/undo`, {});
  }

  async listSnapshots(cartId: string): Promise<SnapshotsResponse> {
    return this.http.get<SnapshotsResponse>(`/carts/${cartId}/snapshots`);
  }

  /** Undoes every reversible dispatch in the cart, in reverse order. */
  async undoAll(cartId: string): Promise<CartUndoAllResult> {
    return this.http.post<CartUndoAllResult>(`/carts/${cartId}/undo`, undefined);
  }
}
