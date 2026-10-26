import { describe, it, expect, vi } from 'vitest';
import { NetworkResource, NETWORK_CALL_TIMEOUT_MS } from './NetworkResource.js';
import type { HttpClient } from '../HttpClient.js';

function fakeHttp(overrides: Partial<HttpClient> = {}): HttpClient {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    ...overrides
  } as unknown as HttpClient;
}

const ID = 'a'.repeat(64);
/** Every network call gives up past the API gateway's own limit, so a dropped connection never hangs. */
const T = { timeoutMs: NETWORK_CALL_TIMEOUT_MS };

describe('NetworkResource', () => {
  it('whoami GETs /agnt/whoami, naming an assistant only when given', async () => {
    const http = fakeHttp();
    const network = new NetworkResource(http);
    await network.whoami();
    await network.whoami({ assistant: 'as1' });
    expect(http.get).toHaveBeenNthCalledWith(1, '/agnt/whoami', { assistant: undefined }, T);
    expect(http.get).toHaveBeenNthCalledWith(2, '/agnt/whoami', { assistant: 'as1' }, T);
  });

  it('send POSTs the body as given', async () => {
    const http = fakeHttp();
    const body = { to: ['bob@agent.example.net', 'carol@agent.example.org'], text: 'hi', headers: { subject: 'x' } };
    await new NetworkResource(http).send(body);
    expect(http.post).toHaveBeenCalledWith('/agnt/send', body, T);
  });

  it('inbox passes the exact opaque since, limit and assistant as query', async () => {
    const http = fakeHttp();
    const since = '  00041+/=%:opaque  ';
    await new NetworkResource(http).inbox({ since, limit: 10 });
    expect(http.get).toHaveBeenCalledWith('/agnt/inbox', { since, limit: 10, assistant: undefined }, T);
  });

  it('refuses legacy after including zero, empty/non-string tokens and invalid limits before HTTP', async () => {
    const http = fakeHttp();
    const resource = new NetworkResource(http);
    for (const after of [0, 41, undefined, 'opaque']) {
      await expect(resource.inbox({ after } as any)).rejects.toThrow(/There is no after/);
    }
    for (const since of ['', null, 41]) await expect(resource.inbox({ since } as any)).rejects.toThrow(/nonempty token/);
    for (const limit of [0, 201, 1.5, NaN, '50']) await expect(resource.inbox({ limit } as any)).rejects.toThrow(/1 to 200/);
    expect(http.get).not.toHaveBeenCalled();
  });

  it('wait passes from and timeout as query', async () => {
    const http = fakeHttp();
    await new NetworkResource(http).wait({ from: 'bob@agent.example.net', timeout: 20 });
    // The call gives up 15 seconds past the server's own deadline, so a dead connection never hangs.
    expect(http.get).toHaveBeenCalledWith('/agnt/wait', { from: 'bob@agent.example.net', timeout: 20, assistant: undefined }, { timeoutMs: 35_000 });
  });

  it('sent GETs /agnt/sent/:id', async () => {
    const http = fakeHttp();
    await new NetworkResource(http).sent(ID);
    expect(http.get).toHaveBeenCalledWith(`/agnt/sent/${ID}`, { assistant: undefined }, T);
  });

  it('the call timeout is past the API gateway\'s 29 seconds, so the server answers first', () => {
    expect(NETWORK_CALL_TIMEOUT_MS).toBeGreaterThan(29_000);
    expect(NETWORK_CALL_TIMEOUT_MS).toBeLessThanOrEqual(40_000);
  });

  it('verify wraps the message as {message}', async () => {
    const http = fakeHttp();
    const entry = { id: ID, message: { untrusted: {} } };
    await new NetworkResource(http).verify(entry);
    expect(http.post).toHaveBeenCalledWith('/agnt/verify', { message: entry }, T);
  });

  it('blocks: list, add with {match} (assistant in the body), remove with ?match=', async () => {
    const http = fakeHttp();
    const network = new NetworkResource(http);
    await network.listBlocks();
    await network.block('spam@agent.example.test');
    await network.block('spam@agent.example.test', { assistant: 'as1' });
    await network.unblock('*@spam.example');
    expect(http.get).toHaveBeenCalledWith('/agnt/blocks', { assistant: undefined }, T);
    expect(http.post).toHaveBeenCalledWith('/agnt/blocks', { match: 'spam@agent.example.test' }, T);
    expect(http.post).toHaveBeenCalledWith('/agnt/blocks', { match: 'spam@agent.example.test', assistant: 'as1' }, T);
    expect(http.delete).toHaveBeenCalledWith('/agnt/blocks', { match: '*@spam.example', assistant: undefined }, T);
  });

  it('sent: the list pages by an opaque after; one report by id', async () => {
    const http = fakeHttp();
    const network = new NetworkResource(http);
    await network.sentList({ after: 'c1', limit: 10 });
    await network.sent('a'.repeat(64));
    expect(http.get).toHaveBeenCalledWith('/agnt/sent', { after: 'c1', limit: 10, assistant: undefined }, T);
    expect(http.get).toHaveBeenCalledWith(`/agnt/sent/${'a'.repeat(64)}`, { assistant: undefined }, T);
  });

  it('leave POSTs only the typed confirmation', async () => {
    const http = fakeHttp();
    await new NetworkResource(http).leave('sally@agent.example.test');
    expect(http.post).toHaveBeenCalledWith('/agnt/leave', { confirm: 'sally@agent.example.test' }, T);
  });

  it("the agent's own email: start, verify and remove", async () => {
    const http = fakeHttp();
    const network = new NetworkResource(http);
    await network.startAgentEmail('sally@example.org');
    await network.verifyAgentEmail('sally@example.org', '123456');
    await network.removeAgentEmail('sally@example.org');
    expect(http.post).toHaveBeenNthCalledWith(1, '/agnt/agent-email/start', { email: 'sally@example.org' });
    expect(http.post).toHaveBeenNthCalledWith(2, '/agnt/agent-email/verify', { email: 'sally@example.org', code: '123456' });
    expect(http.delete).toHaveBeenCalledWith('/agnt/agent-email', { email: 'sally@example.org' });
  });
});
