import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { networkDiscoveryShow, networkDiscoverySet, networkDiscoveryAdd, networkDiscoveryConfirm, networkDiscoveryRemove, ASK_FIRST } from './networkDiscovery.js';
import { describeError } from './network.js';
import { PortalClient } from '../../index.js';

/**
 * A fake API for the discovery switch that answers as the API does today:
 *   GET /agnt/discovery            -> { listed, assistant, changedBy, changedAt, identifiers: [{ identifier, directory }] }
 *   PUT /agnt/discovery { listed, assistant? }   the same view; strict: an unknown field, or a listed that is not a
 *                                  boolean, is 400 `invalid`. An agent's key lists its own assistant. No assistant to
 *                                  lead to is 409 `no_assistant`. A key that is not the person's or their agent's is 403
 *                                  `portal_person_only`. While the app's network is off, every route is a bare 404.
 *   POST /agnt/discovery/identifiers { identifier, assistant? }   an agent's own email or phone: { identifier, directory:
 *                                  'code_sent' }. Not an agent's key: 403 `agent_only`. Someone else's: 409 `identifier_taken`.
 *   POST /agnt/discovery/confirm { identifier, code, assistant? }  { identifier, directory: 'listed' }; the wrong code is
 *                                  400 `bad_code`.
 *   DELETE /agnt/discovery/identifiers?identifier=&assistant=      { identifier, directory: 'unlisted' }.
 */
function fakeDiscoveryApi() {
  const state = { listed: false, changedBy: null as null | 'agent' | 'person', changedAt: null as null | string, networkOff: false, assistant: 'as_agent' as string | null, foreignKey: false, notAgent: false, taken: false, directoryDown: false, code: '123456' };
  const requests: Array<{ method: string; path: string; body?: any }> = [];
  const identifiers = ['mailto:person@example.com', 'tel:+15555550100'];
  /** As the directory stores it: mailto:<email> or tel:<+phone>. */
  const normalized = (id: string) => (/^(mailto|tel):/.test(id) ? id : id.includes('@') ? `mailto:${id}` : `tel:${id}`);
  const json = (res: any, status: number, body: unknown) => {
    res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body));
  };
  const refuse = (res: any, status: number, error_code: string, error: string) => json(res, status, { status, error, error_code });
  const view = () => ({
    listed: state.listed,
    assistant: state.listed ? state.assistant : null,
    changedBy: state.changedBy,
    changedAt: state.changedAt,
    identifiers: identifiers.map((identifier) => ({ identifier, directory: state.listed ? 'not_supported' : 'unlisted' })),
  });
  const server: Server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;
    requests.push({ method: req.method!, path: req.url!, ...(body !== undefined ? { body } : {}) });
    if (state.networkOff) return json(res, 404, { status: 404, error: 'Not found' });
    const path = new URL(req.url!, 'http://x').pathname;
    if (path === '/agnt/discovery/identifiers' && (req.method === 'POST' || req.method === 'DELETE')) {
      const identifier = req.method === 'POST' ? body?.identifier : new URL(req.url!, 'http://x').searchParams.get('identifier');
      if (state.notAgent) return refuse(res, 403, 'agent_only', 'Your own emails and phones are listed by the discovery switch');
      if (req.method === 'POST' && state.taken) return refuse(res, 409, 'identifier_taken', 'Someone else in this app holds that identifier');
      return json(res, 200, { identifier: normalized(identifier), directory: req.method === 'POST' ? (state.directoryDown ? 'unavailable' : 'code_sent') : 'unlisted' });
    }
    if (path === '/agnt/discovery/confirm' && req.method === 'POST') {
      if (body?.code !== state.code) return refuse(res, 400, 'bad_code', 'That is not the code the directory sent, or it expired');
      return json(res, 200, { identifier: normalized(body.identifier), directory: state.directoryDown ? 'unavailable' : 'listed' });
    }
    if (req.url !== '/agnt/discovery') return json(res, 404, { status: 404, error: 'Not found' });
    if (req.method === 'GET') return json(res, 200, view());
    if (req.method !== 'PUT') return json(res, 404, { status: 404, error: 'Not found' });
    if (!body || typeof body.listed !== 'boolean' || Object.keys(body).some((k) => !['listed', 'assistant'].includes(k))) {
      return refuse(res, 400, 'invalid', 'Invalid request body');
    }
    if (state.foreignKey) return refuse(res, 403, 'portal_person_only', 'Only the person, signed in, or their agent can change this');
    if (body.listed && !state.assistant) return refuse(res, 409, 'no_assistant', 'There is no assistant to be found by');
    state.listed = body.listed;
    state.changedBy = 'agent';
    state.changedAt = '2026-10-26T12:00:00.000Z';
    return json(res, 200, view());
  });
  return { server, state, requests };
}

describe('network discovery, against the API as it answers today', () => {
  let api: ReturnType<typeof fakeDiscoveryApi>;
  let client: PortalClient;

  beforeEach(async () => {
    api = fakeDiscoveryApi();
    await new Promise<void>((resolve, reject) => { api.server.once('error', reject); api.server.listen(0, '127.0.0.1', resolve); });
    const address = api.server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a loopback port');
    client = new PortalClient({ apiUrl: `http://127.0.0.1:${address.port}`, apiKey: 'test-key' });
  });

  afterEach(async () => {
    api.server.closeAllConnections();
    await new Promise<void>((resolve) => api.server.close(() => resolve()));
  });

  it('show reads the switch, off by default, with the ask-first note', async () => {
    const { result } = await networkDiscoveryShow(client) as any;
    expect(api.requests).toEqual([{ method: 'GET', path: '/agnt/discovery' }]);
    expect(result).toEqual({
      listed: false, assistant: null, changedBy: null, changedAt: null,
      identifiers: [{ identifier: 'mailto:person@example.com', directory: 'unlisted' }, { identifier: 'tel:+15555550100', directory: 'unlisted' }],
      note: ASK_FIRST,
    });
    expect(ASK_FIRST).toMatch(/your person's choice: turn it on or off only after asking them/);
  });

  it('on and off send PUT { listed } and nothing else, and answer with the switch', async () => {
    const on = (await networkDiscoverySet(client, true, {}) as any).result;
    expect(on).toMatchObject({ listed: true, assistant: 'as_agent', changedBy: 'agent', note: ASK_FIRST });
    expect(on.identifiers.map((i: any) => i.directory)).toEqual(['not_supported', 'not_supported']);
    const off = (await networkDiscoverySet(client, false, {}) as any).result;
    expect(off).toMatchObject({ listed: false, assistant: null });
    expect(api.requests).toEqual([
      { method: 'PUT', path: '/agnt/discovery', body: { listed: true } },
      { method: 'PUT', path: '/agnt/discovery', body: { listed: false } },
    ]);
  });

  it('--assistant goes in the body only when given', async () => {
    await networkDiscoverySet(client, true, { assistant: 'as_agent' });
    expect(api.requests[0].body).toEqual({ listed: true, assistant: 'as_agent' });
  });

  it('refusals come back with a plain hint: no assistant, not the person or their agent, network off', async () => {
    api.state.assistant = null;
    const noAssistant = describeError('discovery on', await networkDiscoverySet(client, true, {}).catch((e) => e));
    expect(noAssistant.body).toMatchObject({ code: 'no_assistant', status: 409, hint: expect.stringMatching(/no assistant yet for people to find/) });
    expect(noAssistant.exitCode).toBe(1);

    api.state.foreignKey = true;
    const foreign = describeError('discovery off', await networkDiscoverySet(client, false, {}).catch((e) => e));
    expect(foreign.body).toMatchObject({ code: 'portal_person_only', status: 403, hint: expect.stringMatching(/or their own agent can change discovery/) });

    api.state.networkOff = true;
    const off = describeError('discovery show', await networkDiscoveryShow(client).catch((e) => e));
    expect(off.body.status).toBe(404);
    expect(off.body.hint).toBeTruthy();
  });

  it("add asks the directory to send a code to the agent's own email, and says what to run next", async () => {
    const { result } = await networkDiscoveryAdd(client, 'sally@example.org', {}) as any;
    expect(api.requests).toEqual([{ method: 'POST', path: '/agnt/discovery/identifiers', body: { identifier: 'sally@example.org' } }]);
    expect(result).toMatchObject({ identifier: 'mailto:sally@example.org', directory: 'code_sent', next: expect.stringMatching(/ network discovery confirm mailto:sally@example\.org <the code>$/) });
    expect(result.askUser).toMatch(/one-time code went to mailto:sally@example\.org/);
  });

  it('the next command keeps the profile and assistant add was run with', async () => {
    const { result } = await networkDiscoveryAdd(client, '+15555550100', { profile: 'me', assistant: 'as_agent' }) as any;
    expect(result.next).toMatch(/ network discovery confirm --profile me --assistant as_agent tel:\+15555550100 <the code>$/);
  });

  it('a directory that did not take it says nothing was listed, for add and for confirm', async () => {
    api.state.directoryDown = true;
    const added = (await networkDiscoveryAdd(client, 'sally@example.org', {}) as any).result;
    expect(added).toMatchObject({ directory: 'unavailable', note: expect.stringMatching(/did not list it just now/) });
    expect(added.next).toBeUndefined();
    const confirmed = (await networkDiscoveryConfirm(client, 'sally@example.org', '123456', {}) as any).result;
    expect(confirmed).toMatchObject({ directory: 'unavailable', note: expect.stringMatching(/did not list it just now/) });
  });

  it('confirm sends the code, and the answer is listed; --assistant goes in the body only when given', async () => {
    const { result } = await networkDiscoveryConfirm(client, 'sally@example.org', '123456', { assistant: 'as_agent' }) as any;
    expect(api.requests).toEqual([{ method: 'POST', path: '/agnt/discovery/confirm', body: { identifier: 'sally@example.org', code: '123456', assistant: 'as_agent' } }]);
    expect(result).toEqual({ identifier: 'mailto:sally@example.org', directory: 'listed' });
  });

  it('remove drops it: DELETE with the identifier in the query', async () => {
    const { result } = await networkDiscoveryRemove(client, '+15555550100', {}) as any;
    expect(api.requests).toEqual([{ method: 'DELETE', path: '/agnt/discovery/identifiers?identifier=%2B15555550100' }]);
    expect(result).toEqual({ identifier: 'tel:+15555550100', directory: 'unlisted' });
  });

  it('refusals of the identifier commands come back with a plain hint', async () => {
    api.state.notAgent = true;
    const notAgent = describeError('discovery add', await networkDiscoveryAdd(client, 'sally@example.org', {}).catch((e) => e));
    expect(notAgent.body).toMatchObject({ code: 'agent_only', status: 403, hint: expect.stringMatching(/Only an agent's own key lists or drops its own/) });
    api.state.notAgent = false;

    api.state.taken = true;
    const taken = describeError('discovery add', await networkDiscoveryAdd(client, 'sally@example.org', {}).catch((e) => e));
    expect(taken.body).toMatchObject({ code: 'identifier_taken', status: 409, hint: expect.stringMatching(/Someone else in this app holds that email or phone/) });

    const wrong = describeError('discovery confirm', await networkDiscoveryConfirm(client, 'sally@example.org', '000000', {}).catch((e) => e));
    expect(wrong.body).toMatchObject({ code: 'bad_code', status: 400, hint: expect.stringMatching(/discovery add <identifier> again/) });
    expect(wrong.body.retryable).toBe(false);
  });
});
