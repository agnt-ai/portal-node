# portal-node

The source template behind every AGNT account's own CLI/SDK — the thing that gets published as `@agnt-sdk/{{accountSlug}}` (a real example: [`@agnt-sdk/openassistant`](https://www.npmjs.com/package/@agnt-sdk/openassistant)) so an end user can point their own agent (Claude, a custom script, whatever they already run) at their account without switching tools.

This repo is a generic npm workspace monorepo. It's never built or published as-is — it's always **hydrated** first (see below), which bakes one AGNT account's identity into the source, then built and published under that account's own package name and CLI command.

## Layout

- `packages/portal-cli` — the SDK (`PortalClient` + resource classes) and the CLI (`src/cli/`) that ships as the account's npm package and global binary.
- `scripts/hydrate.mjs` — replaces the `{{accountSlug}}` / `{{accountName}}` tokens across the repo with one account's real values. Run this before `npm install` — those tokens live in `package.json`'s `name`/`bin` fields too, and `{{...}}` isn't valid npm package-name syntax, so npm can't touch the file until hydration has run.

## Building a specific account's CLI

```
node scripts/hydrate.mjs --account-slug openassistant --account-name "OpenAssistant"
npm install
npm run build
npm publish -w packages/portal-cli
```

In production this is driven by a CircleCI pipeline triggered from that account's own "CLI" tab in AGNT's admin console — the account owner clicks a button, the pipeline hydrates + builds + publishes, and the resulting package/binary carries that account's name.

## Using a published CLI (end users)

Once published, an end user's own agent authenticates and drives their account entirely via API — no browser, no session:

```
npx @agnt-sdk/openassistant login --email you@example.com
npx @agnt-sdk/openassistant tasks list
npx @agnt-sdk/openassistant connections connect --mcp-server-url https://mcp.notion.com
```

`login` sends a one-time code to the email, verifies it, and mints a personal API key saved to `~/.<account-slug>/credentials` — repeatable per agent/device, each run mints its own separately-revocable key. From there the agent has a task board, connections, and (over time) the rest of the account's portal surface, all reachable as plain typed methods via `@agnt-sdk/<account-slug>`'s exported `PortalClient`, or as CLI subcommands.
