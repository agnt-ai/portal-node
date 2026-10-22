import { describe, it, expect, vi } from 'vitest';
import { AgntResource } from './AgntResource.js';
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

describe('AgntResource', () => {
  it('whoami GETs /agnt/whoami, naming an assistant only when given', async () => {
    const http = fakeHttp();
    const agnt = new AgntResource(http);
    await agnt.whoami();
    await agnt.whoami({ assistant: 'as1' });
    expect(http.get).toHaveBeenNthCalledWith(1, '/agnt/whoami', { assistant: undefined });
    expect(http.get).toHaveBeenNthCalledWith(2, '/agnt/whoami', { assistant: 'as1' });
  });

  it('send POSTs the body as given', async () => {
    const http = fakeHttp();
    const body = { to: ['bob@agnt.example.net', 'carol@example.com'], text: 'hi', headers: { subject: 'x' } };
    await new AgntResource(http).send(body);
    expect(http.post).toHaveBeenCalledWith('/agnt/send', body);
  });

  it('inbox passes after, limit and assistant as query', async () => {
    const http = fakeHttp();
    await new AgntResource(http).inbox({ after: 41, limit: 10 });
    expect(http.get).toHaveBeenCalledWith('/agnt/inbox', { after: 41, limit: 10, assistant: undefined });
  });

  it('wait passes from and timeout as query', async () => {
    const http = fakeHttp();
    await new AgntResource(http).wait({ from: 'bob@agnt.example.net', timeout: 20 });
    // The call gives up 15 seconds past the server's own deadline, so a dead connection never hangs.
    expect(http.get).toHaveBeenCalledWith('/agnt/wait', { from: 'bob@agnt.example.net', timeout: 20, assistant: undefined }, { timeoutMs: 35_000 });
  });

  it('sent GETs /agnt/sent/:id', async () => {
    const http = fakeHttp();
    await new AgntResource(http).sent(ID);
    expect(http.get).toHaveBeenCalledWith(`/agnt/sent/${ID}`, { assistant: undefined });
  });

  it('verify wraps the message as {message}', async () => {
    const http = fakeHttp();
    const entry = { id: ID, message: { untrusted: {} } };
    await new AgntResource(http).verify(entry);
    expect(http.post).toHaveBeenCalledWith('/agnt/verify', { message: entry });
  });

  it('blocks: list, add with {match}, remove with ?match=', async () => {
    const http = fakeHttp();
    const agnt = new AgntResource(http);
    await agnt.listBlocks();
    await agnt.block('spam@agent.example.test');
    await agnt.unblock('*@spam.example');
    expect(http.get).toHaveBeenCalledWith('/agnt/blocks');
    expect(http.post).toHaveBeenCalledWith('/agnt/blocks', { match: 'spam@agent.example.test' });
    expect(http.delete).toHaveBeenCalledWith('/agnt/blocks', { match: '*@spam.example' });
  });

  it('leave POSTs only the typed confirmation', async () => {
    const http = fakeHttp();
    await new AgntResource(http).leave('sally@agent.example.test');
    expect(http.post).toHaveBeenCalledWith('/agnt/leave', { confirm: 'sally@agent.example.test' });
  });

  it("the agent's own email: start, verify and remove", async () => {
    const http = fakeHttp();
    const agnt = new AgntResource(http);
    await agnt.startAgentEmail('sally@example.org');
    await agnt.verifyAgentEmail('sally@example.org', '123456');
    await agnt.removeAgentEmail('sally@example.org');
    expect(http.post).toHaveBeenNthCalledWith(1, '/agnt/agent-email/start', { email: 'sally@example.org' });
    expect(http.post).toHaveBeenNthCalledWith(2, '/agnt/agent-email/verify', { email: 'sally@example.org', code: '123456' });
    expect(http.delete).toHaveBeenCalledWith('/agnt/agent-email', { email: 'sally@example.org' });
  });
});
