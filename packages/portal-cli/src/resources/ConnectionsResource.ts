import type { HttpClient } from '../HttpClient.js';
import type { Integration, ResourceAccessMode, ResourceAccessKind } from '../types.js';

const BUILTIN_PROVIDERS = ['slack', 'teams', 'zoom'] as const;
type BuiltinProvider = (typeof BUILTIN_PROVIDERS)[number];

export interface ConnectMcpOptions {
  /** The MCP server URL for the skill you're connecting (e.g. Notion, Linear, Attio, Dropbox). */
  mcpServerUrl: string;
  /** 'user' (default) — per-user install. 'tenant' — shared account-wide install. */
  scope?: 'user' | 'tenant';
}

export interface ConnectBuiltinOptions {
  provider: BuiltinProvider;
  /** 'org' or 'team' — which level this connection binds at. */
  target: 'org' | 'team';
  targetId: string;
}

export interface ConnectionIntent {
  authUrl: string;
}

/**
 * Connections — third-party OAuth integrations (what agnt-portal itself
 * calls "integrations", backed by UserIntegration — NOT the portal's own
 * "connections" concept, which is actually email/phone identifiers; see
 * IdentifiersResource for that). list()/disconnect()/etc. wrap
 * portalIntegrationsController's /portal/integrations/* routes.
 *
 * connectMcp()/connectBuiltin() are headless OAuth intents: these endpoints
 * already return a JSON { authUrl } (or { url }) rather than redirecting,
 * and already accept personal-API-key auth identically to a portal session
 * — see mcpOauthController.initiate, oauthController.{slack,teams,zoom}Authorize.
 * The CLI prints the URL for a human to open in any browser; the callback
 * needs no session of its own and writes the resulting token against the
 * key's own account/user.
 */
export class ConnectionsResource {
  constructor(private http: HttpClient) {}

  /** List this user's connected third-party integrations (Google, Slack, MCP skills, etc). */
  async list(): Promise<Integration[]> {
    const r = await this.http.get<any>('/portal/integrations');
    return r.integrations ?? [];
  }

  /** Disconnect an integration. Accepts either its ObjectId or its oauthId. */
  async disconnect(integrationId: string): Promise<void> {
    await this.http.delete(`/portal/integrations/${integrationId}`);
  }

  /** Re-initiate OAuth for an integration that needs re-auth (e.g. an expired MCP token). Returns an authUrl for MCP integrations. */
  async refresh(integrationId: string): Promise<{ authUrl?: string }> {
    return this.http.post<any>(`/portal/integrations/${integrationId}/refresh`);
  }

  /** Update per-resource access (calendar/contacts/email/drive/etc — 'off'|'read'|'read_write') for an integration. */
  async updateResourceAccess(integrationId: string, access: Partial<Record<ResourceAccessKind, ResourceAccessMode>>): Promise<Integration> {
    const r = await this.http.patch<any>(`/portal/integrations/${integrationId}/resource-access`, access);
    return r.integration;
  }

  /** Connect an MCP-registry skill (Notion, Linear, Attio, Dropbox, etc.) — needs its mcpServerUrl. */
  async connectMcp(opts: ConnectMcpOptions): Promise<ConnectionIntent> {
    const r = await this.http.post<any>('/mcp/oauth/initiate', {
      mcpServerUrl: opts.mcpServerUrl,
      scope: opts.scope ?? 'user'
    });
    return { authUrl: r.mcp_oauth_initiate?.authUrl ?? r.authUrl };
  }

  /** Connect a built-in org/team-level integration (Slack, Teams, or Zoom). */
  async connectBuiltin(opts: ConnectBuiltinOptions): Promise<ConnectionIntent> {
    if (!BUILTIN_PROVIDERS.includes(opts.provider)) {
      throw new Error(`Unknown built-in provider "${opts.provider}" — expected one of: ${BUILTIN_PROVIDERS.join(', ')}`);
    }
    const r = await this.http.get<any>(`/oauth/${opts.provider}/authorize`, {
      target: opts.target,
      targetId: opts.targetId
    });
    return { authUrl: r.oauth?.url ?? r.url };
  }
}

export { BUILTIN_PROVIDERS };
export type { BuiltinProvider };
