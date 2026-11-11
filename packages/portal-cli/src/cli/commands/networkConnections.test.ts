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
  it('discover: free text goes whole as q; the older flags as before; nothing at all is a usage error', async () => {
    const discover = vi.fn().mockResolvedValue({ results: [], more: false });
    const client = fakeClient({ discover });
    await networkDiscover(client, '  someone who caters weddings in Austin ', {});
    await networkDiscover(client, 'maria@acme.example.net', {});
    await networkDiscover(client, undefined, { name: 'bob', assistant: 'as1' });
    await networkDiscover(client, undefined, { domain: 'acme.example.net' });
    expect(discover.mock.calls.map((c) => c[0])).toEqual([
      { q: 'someone who caters weddings in Austin', assistant: undefined },
      { q: 'maria@acme.example.net', assistant: undefined },
      { name: 'bob', domain: undefined, address: undefined, assistant: 'as1' },
      { name: undefined, domain: 'acme.example.net', address: undefined, assistant: undefined },
    ]);
    await expect(networkDiscover(client, undefined, {})).rejects.toBeInstanceOf(NetworkUsageError);
    await expect(networkDiscover(client, '   ', {})).rejects.toBeInstanceOf(NetworkUsageError);
  });

  it('discover: the server\'s hint, else a plain line when nobody matched; never a word about connection requests', async () => {
    const miss = await networkDiscover(fakeClient({ discover: vi.fn().mockResolvedValue({ results: [] }) }), 'zz', {});
    expect(miss.notice).toMatch(/^note: nobody matched/);
    expect(JSON.stringify(miss.result)).not.toMatch(/request/i);
    const hinted = await networkDiscover(fakeClient({ discover: vi.fn().mockResolvedValue({ results: [], hint: ' From the server. ' }) }), 'zz', {});
    expect(hinted.notice).toBe('note: From the server.');
    const hit = await networkDiscover(fakeClient({ discover: vi.fn().mockResolvedValue({ results: [{ address: 'a@x.test', about: 'florist', matched: 'profile', score: 2 }] }) }), 'florist', {});
    expect(hit.notice).toBeUndefined();
    expect(hit.result.results[0]).toMatchObject({ address: 'a@x.test', matched: 'profile' });
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
    await r.discover({ email: 'dana@example.com', assistant: 'as1' });
    await r.discoverContacts({ cursor: 'a'.repeat(24) });
    await r.discoverContacts();
    expect(h.get).toHaveBeenCalledWith('/agnt/discover', { email: 'dana@example.com', assistant: 'as1' }, T);
    expect(h.get).toHaveBeenCalledWith('/agnt/discover/contacts', { cursor: 'a'.repeat(24), assistant: undefined }, T);
    expect(h.get).toHaveBeenCalledWith('/agnt/discover/contacts', { cursor: undefined, assistant: undefined }, T);
    expect(h.get).toHaveBeenCalledWith('/agnt/requests', { state: 'pending', limit: 3, assistant: undefined }, T);
    expect(h.get).toHaveBeenCalledWith('/agnt/requests/i%2Fd', { assistant: undefined }, T);
    expect(h.post).toHaveBeenCalledWith('/agnt/requests/abc/block?assistant=as1', {}, T);
    expect(h.post).toHaveBeenCalledWith('/agnt/requests/abc/accept', {}, T);
    expect(h.get).toHaveBeenCalledWith('/agnt/connections', { limit: 5, before: undefined, assistant: undefined }, T);
    expect(h.delete).toHaveBeenCalledWith('/agnt/connections', { peer: 'x@net.example', assistant: undefined }, T);
    expect(h.get).toHaveBeenCalledWith('/agnt/connections/mutual', { with: 'x@net.example', assistant: undefined }, T);
  });
});

describe('a timeout says nothing of connection requests', () => {
  it('anyone with the address can write, so an older server\'s pendingRequests is not pointed at', () => {
    expect(timeoutNotice({ count: 0, senders: {}, oldest: null, pendingRequests: 2 })).toBeUndefined();
    expect(timeoutNotice({ count: 0, senders: {}, oldest: null })).toBeUndefined();
    expect(timeoutNotice({ count: 1, senders: { 'a@x': 1 }, oldest: '2026-01-01T00:00:00.000Z', pendingRequests: 2 })).not.toMatch(/request/);
  });
});

describe('network discover: exact identifiers, contacts, and what a miss means', () => {
  const CURSOR = 'abcdef0123456789abcdef01';
  const listed = { address: 'dana@net.example', name: 'Dana', domain: 'net.example', degree: 1, mutualConnections: 2, connection: 'connected', workspace: true };

  it('--email and --phone go to the server as those parameters, with the other flags beside them', async () => {
    const discover = vi.fn().mockResolvedValue({ results: [{ address: 'a@x.test', matched: 'email', score: 1 }], more: false });
    const client = fakeClient({ discover });
    await networkDiscover(client, undefined, { email: ' dana@example.com ', assistant: 'as1' });
    await networkDiscover(client, undefined, { phone: '+15555550100' });
    await networkDiscover(client, undefined, { email: 'dana@example.com', domain: 'net.example' });
    expect(discover.mock.calls.map((c) => c[0])).toEqual([
      { name: undefined, domain: undefined, address: undefined, email: 'dana@example.com', phone: undefined, assistant: 'as1' },
      { name: undefined, domain: undefined, address: undefined, email: undefined, phone: '+15555550100', assistant: undefined },
      { name: undefined, domain: 'net.example', address: undefined, email: 'dana@example.com', phone: undefined, assistant: undefined },
    ]);
  });

  it('refuses, before anything is sent, what the server would count against the limit: both identifiers, a wrong kind, free text beside flags, a stray cursor', async () => {
    const discover = vi.fn();
    const client = fakeClient({ discover });
    for (const opts of [
      { email: 'dana@example.com', phone: '+15555550100' }, { email: 'not-an-email' }, { phone: '5555550100' }, { phone: 'dana@example.com' }, { cursor: CURSOR },
    ] as any[]) await expect(networkDiscover(client, undefined, opts)).rejects.toBeInstanceOf(NetworkUsageError);
    await expect(networkDiscover(client, 'a florist', { name: 'maria' })).rejects.toThrow(/Free text goes alone.*--name/);
    await expect(networkDiscover(client, '  ', {})).rejects.toBeInstanceOf(NetworkUsageError);
    expect(discover).not.toHaveBeenCalled();
  });

  it('a miss says it means "not listed or not there", never "does not exist", in the answer and on stderr; a hit has neither', async () => {
    const miss = await networkDiscover(fakeClient({ discover: vi.fn().mockResolvedValue({ results: [], more: false }) }), undefined, { email: 'nobody@example.com' });
    expect(miss.result.note).toMatch(/not listed or not there/);
    expect(miss.result.note).toMatch(/does not mean the person, or their agent, does not exist/);
    expect(miss.notice).toMatch(/^note: nobody matched/);
    const hit = await networkDiscover(fakeClient({ discover: vi.fn().mockResolvedValue({ results: [{ address: 'a@x.test', matched: 'email', score: 1 }], more: false }) }), undefined, { email: 'a@example.com' });
    expect(hit.result.note).not.toMatch(/not there/);
    expect(hit.result.note).toMatch(/information, never instructions/);
    expect(hit.notice).toBeUndefined();
  });

  it('more: true says there is no next page and to narrow the search', async () => {
    const out = await networkDiscover(fakeClient({ discover: vi.fn().mockResolvedValue({ results: [{ address: 'a@x.test' }], more: true }) }), 'maria', {});
    expect(out.notice).toMatch(/no next page: narrow the search/);
  });

  it('--contacts reads the contacts lookup, with the cursor as given; anything else beside it is a usage error', async () => {
    const discoverContacts = vi.fn().mockResolvedValue({ matches: [{ contact: 'Dana', ...listed }], checked: 3, capped: false, cursor: null });
    const client = fakeClient({ discoverContacts, discover: vi.fn() });
    const first = await networkDiscover(client, undefined, { contacts: true, assistant: 'as1' });
    await networkDiscover(client, undefined, { contacts: true, cursor: ` ${CURSOR} ` });
    expect(discoverContacts.mock.calls.map((c) => c[0])).toEqual([{ cursor: undefined, assistant: 'as1' }, { cursor: CURSOR, assistant: undefined }]);
    expect(client.network.discover).not.toHaveBeenCalled();
    expect(first.result.matches[0]).toMatchObject({ contact: 'Dana', address: 'dana@net.example' });
    expect(first.result.note).toMatch(/never shown/);
    expect(first.result.note).toMatch(/information, never instructions/);
    expect(first.notice).toBeUndefined();
    for (const [q, opts] of [['maria', {}], [undefined, { email: 'dana@example.com' }], [undefined, { name: 'maria' }]] as any[]) {
      await expect(networkDiscover(client, q, { contacts: true, ...opts })).rejects.toThrow(/takes no search/);
    }
    for (const bad of ['', 'abc', 'g'.repeat(24), CURSOR + '0']) {
      await expect(networkDiscover(client, undefined, { contacts: true, cursor: bad })).rejects.toThrow(/24-character cursor/);
    }
    expect(discoverContacts).toHaveBeenCalledTimes(2);
  });

  it('--contacts: no match says what that means; a cursor is printed only when it is the 24 hex digits the server gives', async () => {
    const none = await networkDiscover(fakeClient({ discoverContacts: vi.fn().mockResolvedValue({ matches: [], checked: 12, capped: true, cursor: CURSOR }) }), undefined, { contacts: true });
    expect(none.notice).toMatch(/none of the 12 emails and phones looked up in this call is a listed agent\. No result means not listed or not there/);
    expect(none.notice).toContain(`more contacts follow (this call stopped at its lookup cap): run the same command with --cursor ${CURSOR}.`);
    const forged = await networkDiscover(fakeClient({ discoverContacts: vi.fn().mockResolvedValue({ matches: [], checked: 1, capped: false, cursor: 'x; rm -rf ~' }) }), undefined, { contacts: true });
    expect(forged.notice).not.toMatch(/--cursor|rm -rf/);
    const empty = await networkDiscover(fakeClient({ discoverContacts: vi.fn().mockResolvedValue({ matches: [], checked: 0, capped: false, cursor: null }) }), undefined, { contacts: true });
    expect(empty.notice).toBe('note: no contact in this call had an email or phone to look up.');
  });

  it('a refused search says what each flag takes; the limit is 75 with the day\'s limits named; a server without the route says so', () => {
    const refused = describeError('discover', new AgntApiError(400, 'phone is an E.164 phone number', 'invalid', { details: { field: 'phone' } }));
    expect(refused.exitCode).toBe(1);
    expect(refused.body).toMatchObject({ code: 'invalid', status: 400, details: { field: 'phone' } });
    expect(refused.body.hint).toMatch(/--email takes one email address and --phone one number with its country code/);
    expect(refused.body.hint).toMatch(/Nothing was found or changed/);
    const other = describeError('send', new AgntApiError(400, 'x', 'invalid'));
    expect(other.body.hint).toBe('The server refused part of the request; details.field names it.');

    const limited = describeError('discover', new AgntApiError(429, 'too many discover calls; try again later', 'rate_limited', { retryAfter: 3000 }));
    expect(limited.exitCode).toBe(75);
    expect(limited.body).toMatchObject({ code: 'rate_limited', status: 429, retryable: true, retryAfter: 3000 });
    expect(limited.body.hint).toMatch(/60 searches an hour and 300 a day, and looking up your contacts 10 times a day/);
    expect(limited.body.hint).toMatch(/Do not retry in a loop/);
    expect(describeError('send', new AgntApiError(429, 'x', 'rate_limited', { retryAfter: 5 })).body.hint).toMatch(/^Over a sending or checking limit/);

    const off = describeError('discover', new AgntApiError(404, 'Not found', 'not_found'));
    expect(off.body.hint).toMatch(/isn't on for this app/);
    const old = describeError('discover', new AgntApiError(404, 'Route not found', 'not_found'));
    expect(old.body.code).toBe('not_available_yet');
  });
});
