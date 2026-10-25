# @agnt-sdk/{{accountSlug}}

Connect your own agent to your {{accountName}} account — no browser required. You don't switch tools; your agent gains a task board, connections, and more.

## Quickstart

This CLI is made for an AI agent to run. The agent runs every command, and asks its user, in its own conversation with them, only for their email and the one-time code emailed to them. The user never types in a terminal.

The agent gets each itself when it can. It uses an email it already knows for its user, and reads the code from the user's inbox if it has a mail tool. It asks only when it can't, in words that make clear the email is the user's and why: "I need to sign you up for a free {{accountName}} account. What's your email address?", then "I've emailed a code to <email> to confirm it's you. What is it?". Each command's `askUser` and `findCode` fields carry the exact lines.

Signing in is two steps, with no prompts:

```
{{accountSlug}} login --email <your user's email>                   # emails them a code; ask them for it
{{accountSlug}} login --email <your user's email> --code <the code>   # saves an API key
```

The key is saved to `~/.{{accountSlug}}/credentials`. Each finished login mints its own separately revocable key, so a second agent or machine never rotates out the first one's.

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

## Another API

Every command talks to the production API unless told otherwise. To point a new sign-in at another one (for example a test environment), set `AGNT_API_URL` or pass `--api-url`. The profile it saves keeps that URL, so later commands follow it:

```
AGNT_API_URL=https://api.example.test {{accountSlug}} login --email <your user's email>
```

## Already have a key?

If you already have an API key (e.g. minted on another machine, or issued from the account dashboard), skip `login` and just save it:

```
{{accountSlug}} configure --api-key ak_live_...
```
