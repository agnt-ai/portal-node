import { clientFor } from '../utils/api.js';

export interface CartsOptions {
  profile?: string;
  json?: boolean;
}

export async function runCartsListPending(opts: CartsOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const carts = await client.carts.listPending();

  if (opts.json) {
    console.log(JSON.stringify(carts, null, 2));
    return;
  }
  if (!carts.length) {
    console.log('No carts awaiting review.');
    return;
  }
  for (const cart of carts) {
    console.log(`${cart.id}  ${cart.taskTitle}  [${cart.status}]  ${cart.dispatches.length} dispatch(es)`);
  }
}

export async function runCartsGet(cartId: string, opts: CartsOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const cart = await client.carts.get(cartId);
  console.log(JSON.stringify(cart, null, 2));
}

export async function runCartsApprove(cartId: string, opts: CartsOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.carts.approve(cartId);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Cart ${result.cartId} is now ${result.status}.${result.executionError ? ` (execution error: ${result.executionError})` : ''}`);
}

export interface CartsCancelOptions extends CartsOptions {
  reason?: string;
}

export async function runCartsCancel(cartId: string, opts: CartsCancelOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.carts.cancel(cartId, opts.reason);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Cart ${result.cartId} is now ${result.status}.`);
}

export async function runCartsUpdateDispatch(cartId: string, dispatchIndex: string, body: string, opts: CartsOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    console.error('Body must be valid JSON, e.g. \'{"subject":"New subject"}\'');
    process.exit(1);
  }
  const cart = await client.carts.updateDispatch(cartId, parseInt(dispatchIndex, 10), parsed);

  if (opts.json) {
    console.log(JSON.stringify(cart, null, 2));
    return;
  }
  console.log(`Updated dispatch ${dispatchIndex} on cart ${cartId}.`);
}

export async function runCartsRemoveDispatch(cartId: string, dispatchIndex: string, opts: CartsOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const cart = await client.carts.removeDispatch(cartId, parseInt(dispatchIndex, 10));

  if (opts.json) {
    console.log(JSON.stringify(cart, null, 2));
    return;
  }
  console.log(`Removed dispatch ${dispatchIndex} from cart ${cartId}.`);
}

export async function runCartsUndoDispatch(cartId: string, dispatchIndex: string, opts: CartsOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.carts.undoDispatch(cartId, parseInt(dispatchIndex, 10));
  console.log(JSON.stringify(result, null, 2));
}

export async function runCartsSnapshots(cartId: string, opts: CartsOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.carts.listSnapshots(cartId);
  console.log(JSON.stringify(result, null, 2));
}

export async function runCartsUndoAll(cartId: string, opts: CartsOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.carts.undoAll(cartId);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Cart ${result.cartId}: undone ${result.undone}, skipped ${result.skipped}, expired ${result.expired}, failed ${result.failed}.`);
}
