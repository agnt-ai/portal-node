import { clientFor } from '../utils/api.js';
import { BUILTIN_PROVIDERS, type BuiltinProvider } from '../../resources/ConnectionsResource.js';

export interface ConnectionsListOptions {
  profile?: string;
  json?: boolean;
}

export async function runConnectionsList(opts: ConnectionsListOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const integrations = await client.connections.list();

  if (opts.json) {
    console.log(JSON.stringify(integrations, null, 2));
    return;
  }
  if (!integrations.length) {
    console.log('No connections found.');
    return;
  }
  for (const integration of integrations) {
    const flags = [
      integration.enabled === false ? 'disabled' : null,
      integration.authError ? 'auth-error' : null
    ].filter(Boolean).join(', ');
    console.log(`${integration.id}  ${integration.type}${integration.value ? `  (${integration.value})` : ''}${flags ? `  [${flags}]` : ''}`);
  }
}

export interface ConnectionActionOptions {
  profile?: string;
}

export async function runDisconnect(integrationId: string, opts: ConnectionActionOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.connections.disconnect(integrationId);
  console.log(`Disconnected ${integrationId}.`);
}

export interface RefreshOptions extends ConnectionActionOptions {
  json?: boolean;
}

export async function runRefresh(integrationId: string, opts: RefreshOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.connections.refresh(integrationId);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.authUrl) {
    console.log(`Open this URL to re-authenticate:\n\n  ${result.authUrl}\n`);
  } else {
    console.log(`Refreshed ${integrationId}.`);
  }
}

export interface ConnectOptions {
  mcpServerUrl?: string;
  provider?: string;
  target?: 'org' | 'team';
  targetId?: string;
  scope?: 'user' | 'tenant';
  profile?: string;
  json?: boolean;
}

export async function runConnect(opts: ConnectOptions): Promise<void> {
  const client = await clientFor(opts.profile);

  let authUrl: string;
  if (opts.provider && (BUILTIN_PROVIDERS as readonly string[]).includes(opts.provider)) {
    if (!opts.target || !opts.targetId) {
      console.error(`--target <org|team> and --target-id are required for built-in provider "${opts.provider}"`);
      process.exit(1);
    }
    const intent = await client.connections.connectBuiltin({
      provider: opts.provider as BuiltinProvider,
      target: opts.target,
      targetId: opts.targetId
    });
    authUrl = intent.authUrl;
  } else if (opts.mcpServerUrl) {
    const intent = await client.connections.connectMcp({ mcpServerUrl: opts.mcpServerUrl, scope: opts.scope });
    authUrl = intent.authUrl;
  } else {
    console.error(
      `Usage:\n` +
        `  {{accountSlug}} connections connect --provider <${BUILTIN_PROVIDERS.join('|')}> --target <org|team> --target-id <id>\n` +
        `  {{accountSlug}} connections connect --mcp-server-url <url>   # Notion, Linear, Attio, Dropbox, etc.`
    );
    process.exit(1);
  }

  if (opts.json) {
    console.log(JSON.stringify({ authUrl }, null, 2));
    return;
  }

  console.log(`Open this URL to finish connecting (no login required):\n\n  ${authUrl}\n`);
}
