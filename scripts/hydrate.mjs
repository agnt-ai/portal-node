#!/usr/bin/env node
/**
 * Replaces the {{accountSlug}} / {{accountName}} template tokens across
 * this repo with a specific AGNT account's values, in place. Must run
 * BEFORE `npm install`/`npm run build` — package.json's "name"/"bin" fields
 * carry these tokens too, and `{{...}}` isn't a valid npm package-name
 * character set, so npm itself can't touch the file until this has run.
 *
 * Used by:
 *   - the CircleCI publish pipeline (.circleci/config.yml), one real account
 *     per build/publish run
 *   - local dev/testing, with any placeholder values you like
 *
 * Usage:
 *   node scripts/hydrate.mjs --account-slug openassistant --account-name "OpenAssistant"
 *
 * Idempotent-ish: re-running with different values re-hydrates a file that
 * still contains the tokens, but does NOT revert a file already hydrated to
 * a prior value — this is a one-shot step for a fresh checkout, not a
 * templating engine you round-trip.
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage']);
const ACCOUNT_SLUG_RE = /^[a-z0-9-]+$/;
// Never hydrate this script itself — its own source contains the literal
// token strings as code (the .split() calls below), not just docs. Hydrating
// them in place would rewrite '{{accountSlug}}' to the real slug and corrupt
// the script for every run after this one.
const SELF_PATH = fileURLToPath(import.meta.url);
// Test files reference the literal token text as fixture strings (e.g.
// asserting isHydrated('{{accountSlug}}') === false) — hydrating those
// rewrites the fixture itself and breaks the assertion. Safe to skip
// entirely: *.test.ts never ships in the published package (tsconfig
// excludes it from the build, and it's not in package.json's "files").
const TEST_FILE_RE = /\.test\.[cm]?[jt]sx?$/;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--account-slug') out.accountSlug = argv[++i];
    else if (argv[i] === '--account-name') out.accountName = argv[++i];
  }
  return out;
}

async function collectFiles(dir, root, acc = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(full, root, acc);
    } else if (entry.isFile()) {
      acc.push(full);
    }
  }
  return acc;
}

async function main() {
  const { accountSlug, accountName } = parseArgs(process.argv.slice(2));

  if (!accountSlug || !accountName) {
    console.error('Usage: node scripts/hydrate.mjs --account-slug <slug> --account-name <name>');
    process.exit(1);
  }
  if (!ACCOUNT_SLUG_RE.test(accountSlug)) {
    console.error(`--account-slug "${accountSlug}" must match ${ACCOUNT_SLUG_RE} (lowercase alphanumeric + hyphens — same rule agnt-backend enforces on Account.slug)`);
    process.exit(1);
  }

  const root = new URL('..', import.meta.url).pathname;
  const files = await collectFiles(root, root);

  let changed = 0;
  for (const file of files) {
    if (file === SELF_PATH || TEST_FILE_RE.test(file)) continue;
    const buf = await readFile(file, 'utf-8').catch(() => null);
    if (buf === null) continue; // binary or unreadable — skip
    if (!buf.includes('{{accountSlug}}') && !buf.includes('{{accountName}}')) continue;

    const hydrated = buf
      .split('{{accountSlug}}').join(accountSlug)
      .split('{{accountName}}').join(accountName);

    await writeFile(file, hydrated, 'utf-8');
    changed++;
    console.log(`hydrated: ${relative(root, file)}`);
  }

  console.log(`\n${changed} file(s) hydrated with account=${accountSlug} (${accountName}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
