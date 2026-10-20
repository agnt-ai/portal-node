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

import { readdir, readFile, writeFile, unlink } from 'fs/promises';
import { join, relative } from 'path';
import { realpathSync } from 'fs';
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

// AGNT messaging (the `agnt` commands, agent-guide, agent sign-up) ships only in these apps' CLIs. Every other
// app's build has it removed before anything is compiled, so its CLI, help and package never carry it:
//   - a file whose first line holds AGNT_ONLY_MARK is deleted;
//   - in any other file, the lines from one holding AGNT_BEGIN through the next holding AGNT_END are deleted.
// The markers are plain comments, so in these apps' builds they stay and change nothing.
const AGNT_MESSAGING_APPS = new Set(['openassistant']);
const AGNT_ONLY_MARK = '@agnt-messaging-only';
const AGNT_BEGIN = '@agnt-messaging:begin';
const AGNT_END = '@agnt-messaging:end';

/** The text without its AGNT messaging regions. Throws on a region that is not closed, or an end with no begin. */
export function stripAgntMessaging(text, file = 'file') {
  const out = [];
  let inside = false;
  for (const line of text.split('\n')) {
    if (line.includes(AGNT_BEGIN)) {
      if (inside) throw new Error(`${file}: ${AGNT_BEGIN} inside another region`);
      inside = true;
      continue;
    }
    if (line.includes(AGNT_END)) {
      if (!inside) throw new Error(`${file}: ${AGNT_END} with no ${AGNT_BEGIN}`);
      inside = false;
      continue;
    }
    if (!inside) out.push(line);
  }
  if (inside) throw new Error(`${file}: ${AGNT_BEGIN} never closed`);
  return out.join('\n');
}

/** Removes AGNT messaging from an app that does not have it. Test files included, so the suite matches the build. */
async function removeAgntMessaging(files, root) {
  let removed = 0;
  let stripped = 0;
  for (const file of files) {
    if (file === SELF_PATH) continue;
    const buf = await readFile(file, 'utf-8').catch(() => null);
    if (buf === null) continue;
    const firstLine = buf.slice(0, buf.indexOf('\n') === -1 ? buf.length : buf.indexOf('\n'));
    if (firstLine.includes(AGNT_ONLY_MARK)) {
      await unlink(file);
      removed++;
      continue;
    }
    if (!buf.includes(AGNT_BEGIN) && !buf.includes(AGNT_END)) continue;
    await writeFile(file, stripAgntMessaging(buf, relative(root, file)), 'utf-8');
    stripped++;
  }
  console.log(`AGNT messaging not in this app: ${removed} file(s) removed, ${stripped} file(s) stripped.`);
}

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
  let files = await collectFiles(root, root);

  if (!AGNT_MESSAGING_APPS.has(accountSlug)) {
    await removeAgntMessaging(files, root);
    files = await collectFiles(root, root);
  }

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

// Run as a script, not when imported (a test imports stripAgntMessaging).
const isMain = (() => {
  try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
})();
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
