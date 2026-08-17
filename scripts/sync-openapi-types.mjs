#!/usr/bin/env node
/**
 * Syncs packages/portal-cli/src/generated/api.d.ts from agnt-backend's own
 * OpenAPI spec — the same source of truth agnt-portal's `npm run
 * types:generate` uses (see agnt-portal/scripts/generate-portal-openapi.mjs).
 *
 * Two sources, auto-selected:
 *   - A sibling `agnt-backend` checkout's local functions/agnt-api/openapi.yaml,
 *     when present — this is what a developer gets running `npm run -w agnt-api
 *     sync:openapi` in agnt-backend (which now also syncs this repo the same
 *     way it already syncs agnt-console/agnt-portal/agnt-studio), and it
 *     reflects a schema change that hasn't even been deployed yet.
 *   - Otherwise, HTTPS from agnt-backend's live, unauthenticated GET
 *     /openapi.json — portal-node's own CircleCI project has no access to the
 *     private agnt-backend repo, so a local checkout never exists there; this
 *     is the only source available in that context.
 * An explicit --source/AGNT_API_URL always wins over the local-file check.
 *
 * Run this before `npm run build` (both locally and in CI) — see the `test`
 * and `hydrate_build_publish` CircleCI jobs.
 *
 * Usage:
 *   node scripts/sync-openapi-types.mjs [--source <url>]
 *   AGNT_API_URL=https://staging-api.agnt.ai node scripts/sync-openapi-types.mjs
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { execFileSync } from 'child_process';
import yaml from 'js-yaml';

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

async function loadSpec(source, root) {
  const localPath = resolve(root, '..', 'agnt-backend', 'functions', 'agnt-api', 'openapi.yaml');
  if (!source && !process.env.AGNT_API_URL && existsSync(localPath)) {
    console.log(`Using local sibling checkout: ${localPath}`);
    return yaml.load(readFileSync(localPath, 'utf8'));
  }

  const apiUrl = source ?? process.env.AGNT_API_URL ?? 'https://api.agnt.ai';
  const specUrl = `${apiUrl.replace(/\/$/, '')}/openapi.json`;
  console.log(`Fetching ${specUrl} ...`);
  const res = await fetch(specUrl);
  if (!res.ok) {
    console.error(`Failed to fetch OpenAPI spec: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  return res.json();
}

async function main() {
  const { source } = parseArgs(process.argv.slice(2));
  const root = new URL('..', import.meta.url).pathname;
  const doc = await loadSpec(source, root);

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
