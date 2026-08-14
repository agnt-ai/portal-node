import { describe, it, expect, vi } from 'vitest';
import { ConnectionsResource, BUILTIN_PROVIDERS } from './ConnectionsResource.js';
import type { HttpClient } from '../HttpClient.js';

function fakeHttp(overrides: Partial<HttpClient> = {}): HttpClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    ...overrides
  } as unknown as HttpClient;
}

describe('ConnectionsResource', () => {
  it('list() hits /portal/integrations (not /skills) and unwraps { integrations }', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ ok: true, integrations: [{ id: 'i1', type: 'google' }] }) });

    const result = await new ConnectionsResource(http).list();

    expect(http.get).toHaveBeenCalledWith('/portal/integrations');
    expect(result).toEqual([{ id: 'i1', type: 'google' }]);
  });

  it('list() returns an empty array when { integrations } is absent', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ ok: true }) });
    expect(await new ConnectionsResource(http).list()).toEqual([]);
  });

  it('disconnect() DELETEs /portal/integrations/:id', async () => {
    const http = fakeHttp({ delete: vi.fn().mockResolvedValue(undefined) });
    await new ConnectionsResource(http).disconnect('i1');
    expect(http.delete).toHaveBeenCalledWith('/portal/integrations/i1');
  });

  it('refresh() POSTs to /portal/integrations/:id/refresh and returns the raw result', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue({ authUrl: 'https://provider.example/reauth' }) });
    const result = await new ConnectionsResource(http).refresh('i1');
    expect(http.post).toHaveBeenCalledWith('/portal/integrations/i1/refresh');
    expect(result).toEqual({ authUrl: 'https://provider.example/reauth' });
  });

  it('updateResourceAccess() PATCHes and unwraps { integration }', async () => {
    const http = fakeHttp({ patch: vi.fn().mockResolvedValue({ ok: true, integration: { id: 'i1' } }) });
    const result = await new ConnectionsResource(http).updateResourceAccess('i1', { calendar: 'read_write', drive: 'off' });
    expect(http.patch).toHaveBeenCalledWith('/portal/integrations/i1/resource-access', { calendar: 'read_write', drive: 'off' });
    expect(result).toEqual({ id: 'i1' });
  });

  it('connectMcp() posts mcpServerUrl + scope (defaulting to "user") and unwraps authUrl', async () => {
    const http = fakeHttp({
      post: vi.fn().mockResolvedValue({ mcp_oauth_initiate: { authUrl: 'https://notion.example/oauth' } })
    });
    const resource = new ConnectionsResource(http);

    const intent = await resource.connectMcp({ mcpServerUrl: 'https://mcp.notion.com' });

    expect(http.post).toHaveBeenCalledWith('/mcp/oauth/initiate', {
      mcpServerUrl: 'https://mcp.notion.com',
      scope: 'user'
    });
    expect(intent).toEqual({ authUrl: 'https://notion.example/oauth' });
  });

  it('connectMcp() passes through an explicit tenant scope', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue({ mcp_oauth_initiate: { authUrl: 'x' } }) });
    const resource = new ConnectionsResource(http);

    await resource.connectMcp({ mcpServerUrl: 'https://mcp.notion.com', scope: 'tenant' });

    expect(http.post).toHaveBeenCalledWith('/mcp/oauth/initiate', {
      mcpServerUrl: 'https://mcp.notion.com',
      scope: 'tenant'
    });
  });

  it.each(BUILTIN_PROVIDERS)('connectBuiltin() GETs /oauth/%s/authorize with target + targetId and unwraps url', async (provider) => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ oauth: { url: 'https://provider.example/authorize' } }) });
    const resource = new ConnectionsResource(http);

    const intent = await resource.connectBuiltin({ provider, target: 'team', targetId: 'team_1' });

    expect(http.get).toHaveBeenCalledWith(`/oauth/${provider}/authorize`, { target: 'team', targetId: 'team_1' });
    expect(intent).toEqual({ authUrl: 'https://provider.example/authorize' });
  });

  it('connectBuiltin() rejects an unknown provider without making a request', async () => {
    const http = fakeHttp();
    const resource = new ConnectionsResource(http);

    await expect(resource.connectBuiltin({ provider: 'discord' as any, target: 'team', targetId: 't1' }))
      .rejects.toThrow(/Unknown built-in provider "discord"/);
    expect(http.get).not.toHaveBeenCalled();
  });
});
