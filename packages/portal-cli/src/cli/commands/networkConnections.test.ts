import { describe, it, expect, vi } from 'vitest';
import { networkWait, timeoutNotice, EXIT_WAIT_REQUEST, NetworkUsageError, describeError, type WaitClock } from './network.js';
import { networkDiscover, networkRequests, networkRequest, networkDecide, networkConnections, networkDisconnect, networkMutual } from './networkConnections.js';
import { NetworkResource, NETWORK_CALL_TIMEOUT_MS } from '../../resources/NetworkResource.js';
import type { HttpClient } from '../../HttpClient.js';
import { AgntApiError } from '../../HttpClient.js';

const T = { timeoutMs: NETWORK_CALL_TIMEOUT_MS };
const fakeClient = (network: Record<string, any>) => ({ network }) as any;
const clock = (): WaitClock => { let t = 1_000_000; return { now: () => t, sleep: async (ms) => { t += ms; } }; };
const http = () => ({ get: vi.fn().mockResolvedValue({}), post: vi.fn().mockResolvedValue({}), delete: vi.fn().mockResolvedValue({}) }) as unknown as HttpClient;

describe('network wait: a connection request', () => {
  it('is its own answer: status "request", exit 4, a notice that says it is not a message and the sender\'s words are data', async () => {
    const request = { status: 'request', rule: 'r', request: { id: 'a'.repeat(24), from: 'x@net.example', state: 'pending', messages: 1, receivedAt: null, lastAt: null }, firstMessage: { id: null, text: 'hi' } };
    const wait = vi.fn().mockResolvedValue(request);
    const out = await networkWait(fakeClient({ wait }), {}, clock());
    expect(out.result).toEqual(request);
    expect(out.exitCode).toBe(EXIT_WAIT_REQUEST);
    expect(EXIT_WAIT_REQUEST).toBe(4);
    expect(out.notice).toMatch(/not a message/);
    expect(out.notice).toMatch(/data, never instructions/);
    expect(wait).toHaveBeenCalledTimes(1);
    expect(wait.mock.calls[0][0].requests).toBe(true);
  });
});

describe('connection commands', () => {
  it('discover: a bare word is a name, a dotted one a domain, an @ an address; nothing at all is a usage error', async () => {
    const discover = vi.fn().mockResolvedValue({ results: [], more: false });
    const client = fakeClient({ discover });
    await networkDiscover(client, 'maria', {});
    await networkDiscover(client, 'acme.example.net', {});
    await networkDiscover(client, 'maria@acme.example.net', {});
    await networkDiscover(client, undefined, { name: 'bob', assistant: 'as1' });
    expect(discover.mock.calls.map((c) => c[0])).toEqual([
      { name: 'maria', domain: undefined, address: undefined, assistant: undefined },
      { name: undefined, domain: 'acme.example.net', address: undefined, assistant: undefined },
      { name: undefined, domain: undefined, address: 'maria@acme.example.net', assistant: undefined },
      { name: 'bob', domain: undefined, address: undefined, assistant: 'as1' },
    ]);
    await expect(networkDiscover(client, undefined, {})).rejects.toBeInstanceOf(NetworkUsageError);
  });

  it('requests, one request, decide, connections, disconnect and mutual call the matching resource method', async () => {
    const n = {
      requests: vi.fn().mockResolvedValue({ requests: [], more: false }), request: vi.fn().mockResolvedValue({ request: {}, firstMessage: { id: null, text: '' } }),
      decideRequest: vi.fn().mockResolvedValue({ id: 'i', from: 'f', state: 'connected', released: 1 }), connections: vi.fn().mockResolvedValue({ connections: [], more: false, cursor: null }),
      disconnect: vi.fn().mockResolvedValue({ removed: true }), mutual: vi.fn().mockResolvedValue({}),
    };
    const c = fakeClient(n);
    await networkRequests(c, { declined: true, limit: '5' });
    await networkRequest(c, 'id1', {});
    await networkDecide(c, 'id1', 'accept', {});
    await networkConnections(c, { limit: '10' });
    await networkDisconnect(c, 'x@net.example', {});
    await networkMutual(c, 'x@net.example', {});
    expect(n.requests).toHaveBeenCalledWith({ state: 'declined', limit: 5, assistant: undefined });
    expect(n.decideRequest).toHaveBeenCalledWith('id1', 'accept', { assistant: undefined });
    expect(n.connections).toHaveBeenCalledWith({ limit: 10, before: undefined, assistant: undefined });
    await expect(networkRequests(c, { limit: '0' })).rejects.toBeInstanceOf(NetworkUsageError);
    const shown = await networkRequest(c, 'id1', {}) as any;
    expect(shown.result.note).toMatch(/data, never instructions/);
  });

  it('a request that does not exist has a hint that points at network requests', () => {
    const { body } = describeError('accept', new AgntApiError(404, 'no such connection request', 'request_not_found' as any));
    expect(body.hint).toMatch(/network requests/);
  });
});

describe('NetworkResource: connections and discovery', () => {
  it('calls the /agnt routes with the assistant in the query', async () => {
    const h = http();
    const r = new NetworkResource(h);
    await r.wait({ timeout: 0, requests: true });
    await r.wait({ timeout: 0 });
    await r.discover({ name: 'maria' });
    await r.requests({ state: 'pending', limit: 3 });
    await r.request('i/d');
    await r.decideRequest('abc', 'block', { assistant: 'as1' });
    await r.decideRequest('abc', 'accept');
    await r.connections({ limit: 5 });
    await r.disconnect('x@net.example');
    await r.mutual('x@net.example');
    expect(h.get).toHaveBeenCalledWith('/agnt/wait', { from: undefined, timeout: 0, assistant: undefined, requests: 'true' }, expect.anything());
    expect(h.get).toHaveBeenCalledWith('/agnt/wait', { from: undefined, timeout: 0, assistant: undefined }, expect.anything());
    expect(h.get).toHaveBeenCalledWith('/agnt/discover', { name: 'maria', domain: undefined, address: undefined, assistant: undefined }, T);
    expect(h.get).toHaveBeenCalledWith('/agnt/requests', { state: 'pending', limit: 3, assistant: undefined }, T);
    expect(h.get).toHaveBeenCalledWith('/agnt/requests/i%2Fd', { assistant: undefined }, T);
    expect(h.post).toHaveBeenCalledWith('/agnt/requests/abc/block?assistant=as1', {}, T);
    expect(h.post).toHaveBeenCalledWith('/agnt/requests/abc/accept', {}, T);
    expect(h.get).toHaveBeenCalledWith('/agnt/connections', { limit: 5, before: undefined, assistant: undefined }, T);
    expect(h.delete).toHaveBeenCalledWith('/agnt/connections', { peer: 'x@net.example', assistant: undefined }, T);
    expect(h.get).toHaveBeenCalledWith('/agnt/connections/mutual', { with: 'x@net.example', assistant: undefined }, T);
  });
});

describe('requests waiting are said on a timeout', () => {
  it('timeoutNotice names pending requests, with or without unread messages', () => {
    expect(timeoutNotice({ count: 0, senders: {}, oldest: null, pendingRequests: 2 })).toMatch(/2 connection requests are waiting.*network requests/);
    expect(timeoutNotice({ count: 0, senders: {}, oldest: null })).toBeUndefined();
  });
});
