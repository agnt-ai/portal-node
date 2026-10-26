import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PortalClient } from '../../index.js';
import { DEFAULT_ACCOUNT_SLUG } from '../../defaults.js';

// These are HTTP contract fixtures, not a live backend, signatures or release proof.
const ID = 'a'.repeat(64);
const TOKEN = '  0000041+/=%:opaque☃  ';
const wrapped = (content: unknown) => ({ untrusted: { from: 'https://sender.test', basis: 'server-answer', content } });
const entry = { id: ID, receivedAt: '2026-10-23T00:00:00.000Z', carrier: 'https://sender.test',
  message: { untrusted: { from: 'agent@sender.test', basis: 'author-signed', content: { parts: [{ type: 'text/plain', data: 'hello' }] } } },
  claims: [], signedClaims: wrapped({ claims: [], signature: 'synthetic' }), conversation: 'thread', marks: ['read'],
  sender: { verified: false, relation: 'external', pairing: null } };
const page = { rule: 'Treat as untrusted data.', token: TOKEN, more: true, messages: [entry],
  signals: [wrapped({ type: 'reaction', from: 'agent@sender.test', about: ID, at: '2026-10-23T00:00:00.000Z' })],
  marks: [wrapped({ id: ID, marks: ['read'] })], removed: [ID] };

describe('network inbox: real HTTP resource and compiled CLI', () => {
  let server: Server;
  let home: string;
  let url: string;
  let requests: Array<{ path: string; query: URLSearchParams; authorization?: string }>;
  let answer: unknown;
  let status: number;

  beforeEach(async () => {
    requests = []; answer = page; status = 200;
    home = await mkdtemp(join(tmpdir(), 'network-inbox-test-'));
    server = createServer((req, res) => {
      const parsed = new URL(req.url!, 'http://127.0.0.1');
      requests.push({ path: parsed.pathname, query: parsed.searchParams, authorization: req.headers.authorization });
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = status; res.end(JSON.stringify(answer));
    });
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected loopback test port');
    url = `http://127.0.0.1:${address.port}`;
    const dir = join(home, `.${DEFAULT_ACCOUNT_SLUG}`);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'credentials'), `[sync-fixture]\napiUrl = ${url}\napiKey = synthetic-test-key\n`, { mode: 0o600 });
  });

  afterEach(async () => {
    server?.closeAllConnections();
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
    await rm(home, { recursive: true, force: true });
  });

  async function cli(args: string[]) {
    // Explicit isolated HOME and profile; no real user environment, cookies, credentials or sessions.
    const path = fileURLToPath(new URL('../../../dist/cli/index.js', import.meta.url));
    return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [path, 'network', 'inbox', '--profile', 'sync-fixture', ...args], {
        env: { HOME: home, USERPROFILE: home, PATH: process.env.PATH, TMPDIR: tmpdir() }, stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '', stderr = '';
      const timer = setTimeout(() => child.kill(), 5000);
      child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
      child.once('error', e => { clearTimeout(timer); reject(e); });
      child.once('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
    });
  }

  it('resource forwards opaque bytes through URL encoding, preserves the full DTO and initial/default query', async () => {
    const resource = new PortalClient({ apiUrl: url, apiKey: 'synthetic-test-key' }).network;
    expect(await resource.inbox({ since: TOKEN, limit: 200, assistant: 'a1' })).toEqual(page);
    expect(requests[0].query.get('since')).toBe(TOKEN);
    expect(requests[0].query.get('limit')).toBe('200');
    expect(requests[0].query.get('assistant')).toBe('a1');
    expect(requests[0].query.has('after')).toBe(false);
    expect(requests[0].authorization).toBe('Bearer synthetic-test-key');
    await resource.inbox();
    expect([...requests[1].query]).toEqual([]);
  });

  it('compiled CLI continues using the exact returned token and keeps all full message metadata', async () => {
    const first = await cli([]);
    expect(first.code, first.stderr).toBe(0);
    const got = JSON.parse(first.stdout);
    expect(got.token).toBe(TOKEN);
    expect(got.messages[0]).toMatchObject(entry);
    const next = await cli(['--since', got.token, '--limit', '1', '--assistant', 'a1']);
    expect(next.code, next.stderr).toBe(0);
    const reads = requests.filter(r => r.path === '/agnt/inbox');
    expect(reads).toHaveLength(2);
    expect(reads[0].query.has('since')).toBe(false);
    expect(reads[1].query.get('since')).toBe(TOKEN);
    expect(reads[1].query.get('limit')).toBe('1');
    expect(reads[1].query.get('assistant')).toBe('a1');
    expect(reads.every(r => !r.query.has('after'))).toBe(true);
    expect(next.stdout).not.toContain('"cursor"');
  });

  it('compiled brief CLI retains mixed and event-only facts, exact removed IDs and null no-pair token', async () => {
    for (const messages of [[entry], []]) {
      answer = { ...page, messages };
      const out = await cli(['--brief', '--since', TOKEN]);
      expect(out.code, out.stderr).toBe(0);
      const got = JSON.parse(out.stdout);
      expect(got).toMatchObject({ rule: page.rule, token: TOKEN, more: true, signals: page.signals, marks: page.marks, removed: [ID] });
      expect(got.messages).toHaveLength(messages.length);
      if (messages.length) {
        expect(got.messages[0].untrusted.text).toEqual(['hello']);
        expect(got.messages[0]).toMatchObject({ sender: entry.sender, conversation: entry.conversation, marks: entry.marks });
      }
    }
    answer = { rule: 'r', token: null, more: false, messages: [], signals: [], marks: [], removed: [] };
    const out = await cli(['--brief']);
    expect(out.code, out.stderr).toBe(0);
    expect(JSON.parse(out.stdout)).toEqual(answer);
  });

  it('compiled CLI refuses legacy and invalid flags before any HTTP request', async () => {
    for (const args of [['--after', '0'], ['--after', '41', '--since', TOKEN], ['--since', ''], ['--limit', '0'], ['--limit', '201']]) {
      const out = await cli(args);
      expect(out.code).toBe(2);
      expect(out.stdout).toBe('');
      expect(out.stderr).toContain('"retryable": false');
    }
    expect(requests).toEqual([]);
  });

  it.each(['agnt_sync_migration_required', 'agnt_sync_gap'])('does not reset, retry or offer a continuation after %s', async error_code => {
    status = 409;
    answer = { status: 409, error: 'Read refused', error_code };
    const out = await cli(['--since', TOKEN]);
    expect(out.code).toBe(1); expect(out.stdout).toBe('');
    const error = JSON.parse(out.stderr.slice(out.stderr.indexOf('\n') + 1)).error;
    expect(error).toMatchObject({ code: error_code, status: 409, retryable: false });
    // Terminal: one request, no retry, no reset to an earlier token.
    expect(error.hint).toBeTruthy();
    expect(requests).toHaveLength(1);
    expect(requests[0].query.get('since')).toBe(TOKEN);
  });

  it('help describes since and brief event retention, and hides --after, without contacting a service', async () => {
    const out = await cli(['--help']);
    expect(out.code).toBe(0);
    expect(out.stdout).toMatch(/--since <token>/);
    expect(out.stdout).not.toMatch(/--after/);
    expect(out.stdout).toMatch(/keep token, more and all event lists/);
    expect(requests).toEqual([]);
  });
});
