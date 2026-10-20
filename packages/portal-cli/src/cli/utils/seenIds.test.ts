// @agnt-messaging-only: scripts/hydrate.mjs removes this file from other apps' builds.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rememberIds, resolveIdPrefix } from './seenIds.js';

let dir: string;
vi.mock('./credentials.js', () => ({ resolveCredentialsFilePath: vi.fn(async () => join(dir, 'credentials')) }));

const A = 'abcdef123456' + '0'.repeat(52);
const B = 'abcdef123456' + '1'.repeat(52);
const C = '0123456789ab' + 'f'.repeat(52);

describe('message id prefixes', () => {
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'seen-ids-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('resolves a unique 12+ prefix of an id this profile has shown, and takes full ids as they are', async () => {
    await rememberIds('codex', [A, C, 'not-an-id']);
    expect(await resolveIdPrefix('codex', '0123456789AB')).toEqual({ id: C });
    expect(await resolveIdPrefix('codex', A)).toEqual({ id: A });
    expect(statSync(join(dir, 'message-ids-codex.json')).mode & 0o777).toBe(0o600);
  });

  it('refuses an ambiguous, unknown or too-short prefix, saying what to pass', async () => {
    await rememberIds('codex', [A, B]);
    expect(await resolveIdPrefix('codex', 'abcdef123456')).toEqual({ error: expect.stringMatching(/^2 ids .* start with abcdef123456\. Pass more of it, or the full id\.$/) });
    expect(await resolveIdPrefix('codex', 'ffffffffffff')).toEqual({ error: expect.stringMatching(/No id this CLI has shown you starts with ffffffffffff\. Pass the full id/) });
    expect(await resolveIdPrefix('codex', 'abcdef')).toEqual({ error: expect.stringMatching(/in full \(64 hex characters\), or a unique prefix of 12 or more/) });
  });

  it('keeps each profile apart', async () => {
    await rememberIds('claude-code', [C]);
    expect(await resolveIdPrefix('codex', '0123456789ab')).toHaveProperty('error');
  });
});
