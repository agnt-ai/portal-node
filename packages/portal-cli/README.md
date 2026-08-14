# @agnt-sdk/{{accountSlug}}

Connect your own agent to your {{accountName}} account — no browser required. You don't switch tools; your agent gains a task board, connections, and more.

## Quickstart

```
npx @agnt-sdk/{{accountSlug}} login --email you@example.com
```

This sends a one-time code to your email, verifies it, and saves a personal API key to `~/.{{accountSlug}}/credentials`. Run it again from a second agent or machine and you'll get a second, separately-revocable key — nothing is shared or rotated out from under the first one.

```
{{accountSlug}} tasks list
{{accountSlug}} tasks create "Book a flight to SF" --assistant travel@agnt.ai
{{accountSlug}} connections list
{{accountSlug}} connections connect --mcp-server-url https://mcp.notion.com
{{accountSlug}} connections connect --provider slack --target team --target-id <teamId>
```

`connections connect` prints a URL — open it in any browser (no login required) to finish connecting; the resulting token lands on your account automatically.

Run `{{accountSlug}} <command> --help` for full option details and examples on every command — that's the primary reference if you're an agent driving this CLI programmatically.

## As a library

```ts
import { PortalClient } from '@agnt-sdk/{{accountSlug}}';

const client = new PortalClient({ apiUrl: 'https://api.agnt.ai', apiKey: 'ak_live_...' });
await client.tasks.list();
const { authUrl } = await client.connections.connectMcp({ mcpServerUrl: 'https://mcp.notion.com' });
```

## Already have a key?

If you already have an API key (e.g. minted on another machine, or issued from the account dashboard), skip `login` and just save it:

```
{{accountSlug}} configure --api-key ak_live_...
```
