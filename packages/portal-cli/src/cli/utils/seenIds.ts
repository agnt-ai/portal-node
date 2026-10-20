// @agnt-messaging-only: scripts/hydrate.mjs removes this file from other apps' builds.
/**
 * Message ids this CLI has shown, per profile, so an id can be given as a unique prefix of 12 or more hex
 * characters (--in-reply-to, sent). Only ids the CLI printed are known; the server takes full ids only.
 * Kept next to the credentials file, mode 600, the most recent MAX ids.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { resolveCredentialsFilePath } from './credentials.js';

const MAX = 2000;
export const FULL_ID = /^[0-9a-f]{64}$/;
export const ID_PREFIX = /^[0-9a-f]{12,63}$/;

async function storePath(profile: string): Promise<string> {
  const safe = profile.replace(/[^A-Za-z0-9._-]/g, '_');
  return join(dirname(await resolveCredentialsFilePath()), `message-ids-${safe}.json`);
}

async function load(profile: string): Promise<string[]> {
  try {
    const ids = JSON.parse(await readFile(await storePath(profile), 'utf8'));
    return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string' && FULL_ID.test(id)) : [];
  } catch {
    return [];
  }
}

/** Remember ids the CLI just printed. Best effort: a failure here never fails the command. */
export async function rememberIds(profile: string, ids: Array<string | undefined | null>): Promise<void> {
  const fresh = ids.filter((id): id is string => typeof id === 'string' && FULL_ID.test(id));
  if (!fresh.length) return;
  try {
    const known = await load(profile);
    const merged = [...new Set([...fresh.reverse(), ...known])].slice(0, MAX);
    await writeFile(await storePath(profile), JSON.stringify(merged), { mode: 0o600 });
  } catch {
    /* best effort */
  }
}

export type PrefixResult = { id: string } | { error: string };

/** A full id as is; a 12+ hex prefix resolved to the one shown id it starts, or an explanation. */
export async function resolveIdPrefix(profile: string, value: string): Promise<PrefixResult> {
  const v = value.trim().toLowerCase();
  if (FULL_ID.test(v)) return { id: v };
  if (!ID_PREFIX.test(v)) {
    return { error: `Pass message ids in full (64 hex characters), or a unique prefix of 12 or more of an id this CLI has shown you, not ${value}.` };
  }
  const matches = (await load(profile)).filter((id) => id.startsWith(v));
  if (matches.length === 1) return { id: matches[0] };
  if (!matches.length) return { error: `No id this CLI has shown you starts with ${v}. Pass the full id (64 hex characters).` };
  return { error: `${matches.length} ids this CLI has shown you start with ${v}. Pass more of it, or the full id.` };
}
