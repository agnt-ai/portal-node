#!/usr/bin/env node
/**
 * Syncs packages/portal-cli/src/generated/api.d.ts from agnt-backend's own
 * OpenAPI spec — the same source of truth agnt-portal's `npm run
 * types:generate` uses (see agnt-portal/scripts/generate-portal-openapi.mjs).
 *
 * Unlike agnt-portal's script, this one fetches over HTTPS rather than
 * reading a sibling checkout's local file: portal-node is a public repo
 * with its own public CircleCI project, which has no access to the private
 * agnt-backend repo — but agnt-backend already serves its spec unauthenticated
 * at GET /openapi.json, so that's the only source this can rely on.
 *
 * Run this before `npm run build` (both locally and in CI) — see the `test`
 * and `hydrate_build_publish` CircleCI jobs.
 *
 * Usage:
 *   node scripts/sync-openapi-types.mjs [--source <url>]
 *   AGNT_API_URL=https://staging-api.agnt.ai node scripts/sync-openapi-types.mjs
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { execFileSync } from 'child_process';

// Same tag list agnt-portal's own generate-portal-openapi.mjs filters to —
// the audience-appropriate "User API + Org API" slice, not account-level-only
// tags. A personal API key can reach this same surface (scoped to its own
// user, or to the account for an org-admin's key), so it's the right filter
// here too, not something to redecide independently.
const CLI_TAGS = new Set([
  'Tasks', 'Chats', 'Contacts', 'Tags', 'Memories', 'Calendars',
  'Booking Links', 'Preferences', 'Identifiers', 'Assistants', 'Drive',
  'Onboarding', 'Coordinator', 'Delegations', 'Coverage Spans',
  'Users', 'Teams', 'Organizations', 'Organization Requests',
]);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--source') out.source = argv[++i];
  }
  return out;
}

async function main() {
  const { source } = parseArgs(process.argv.slice(2));
  const apiUrl = source ?? process.env.AGNT_API_URL ?? 'https://api.agnt.ai';
  const specUrl = `${apiUrl.replace(/\/$/, '')}/openapi.json`;

  console.log(`Fetching ${specUrl} ...`);
  const res = await fetch(specUrl);
  if (!res.ok) {
    console.error(`Failed to fetch OpenAPI spec: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const doc = await res.json();

  // Filter to CLI-relevant tags — same logic as agnt-portal's script.
  doc.info.title = 'Portal CLI API';
  for (const [path, methods] of Object.entries(doc.paths ?? {})) {
    for (const [method, op] of Object.entries(methods)) {
      if (!op?.tags?.some((t) => CLI_TAGS.has(t))) {
        delete methods[method];
      } else {
        op.tags = op.tags.filter((t) => CLI_TAGS.has(t));
      }
    }
    if (Object.keys(methods).length === 0) delete doc.paths[path];
  }

  const root = new URL('..', import.meta.url).pathname;
  const specDir = resolve(root, 'packages/portal-cli/openapi');
  mkdirSync(specDir, { recursive: true });
  const specPath = resolve(specDir, 'portal-cli.json');
  writeFileSync(specPath, JSON.stringify(doc));
  console.log(`Filtered spec written to ${specPath} (${Object.keys(doc.paths).length} paths)`);

  const generatedDir = resolve(root, 'packages/portal-cli/src/generated');
  mkdirSync(generatedDir, { recursive: true });
  const outPath = resolve(generatedDir, 'api.d.ts');

  execFileSync('npx', ['--yes', 'openapi-typescript', specPath, '-o', outPath], {
    cwd: root,
    stdio: 'inherit',
  });
  console.log(`Generated types written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
