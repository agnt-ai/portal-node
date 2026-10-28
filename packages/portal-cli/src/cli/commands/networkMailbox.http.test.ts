import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_ACCOUNT_SLUG } from '../../defaults.js';

// HTTP contract fixtures for the mailbox model (a fake server), not a live backend.
const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const entry = (id: string, extra: Record<string, unknown> = {}) => ({
  id, receivedAt: '2026-10-27T10:00:00.000Z', carrier: 'https://c.test', claims: [], sender: { verified: true, relation: 'external', pairing: null },
  kind: 'message', direction: 'received', unread: true, readAt: null,
  message: { untrusted: { from: 'bob@agent.test', basis: 'author-signed', content: { parts: [{ type: 'text/plain', data: 'hello' }] } } }, ...extra,
});
const UNREAD = { count: 2, senders: { 'bob@agent.test': 2 }, oldest: '2026-10-27T09:00:00.000Z' };

describe('the mailbox commands: the compiled CLI against a fake mailbox server and a strict old one', () => {
  let server: Server;
  let home: string;
  let url: string;
  let requests: Array<{ method: string; path: string; query: URLSearchParams; body: any }>;
  let strictOld: boolean;

  beforeEach(async () => {
    requests = []; strictOld = false;
    home = await mkdtemp(join(tmpdir(), 'network-mailbox-test-'));
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const parsed = new URL(req.url!, 'http://127.0.0.1');
        const raw = Buffer.concat(chunks).toString();
        const body = raw ? JSON.parse(raw) : undefined;
        requests.push({ method: req.method!, path: parsed.pathname, query: parsed.searchParams, body });
        const q = parsed.searchParams;
        const send = (status: number, payload: unknown) => { res.setHeader('Content-Type', 'application/json'); res.statusCode = status; res.end(JSON.stringify(payload)); };
        if (parsed.pathname === '/agnt/inbox') {
          const mailboxKeys = ['view', 'unread', 'from', 'thread', 'order', 'cursor', 'digest'].filter((k) => q.has(k));
          if (strictOld) {
            if (mailboxKeys.length) return send(400, { status: 400, error: 'Unrecognized key(s) in object', error_code: 'invalid' });
            return send(200, { rule: 'r', token: 'old', more: false, messages: [entry(A, { kind: undefined })], signals: [], marks: [], removed: [] });
          }
          if (q.get('digest')) return send(200, { rule: 'r', contract: 2, digest: { ...UNREAD, ids: [A, B], idsTruncated: false }, token: 'T0' });
          if (q.get('thread')) return send(200, { rule: 'r', contract: 2, view: 'all', order: 'oldest', messages: [entry(A), entry(B, { direction: 'sent', unread: false })], unread: UNREAD, matching: 2, more: false, cursor: null, token: 'T' });
          return send(200, { rule: 'r', contract: 2, view: q.get('view'), order: 'unread_first', messages: [entry(A)], unread: UNREAD, matching: 2, more: true, cursor: 'CUR1', note: 'n', token: 'T' });
        }
        if (parsed.pathname === '/agnt/ack' && !strictOld) return send(200, { acknowledged: body?.ids?.length ?? 5, unread: { count: 1, senders: { 'bob@agent.test': 1 } } });
        return send(404, { status: 404, error: 'Route not found' });
      });
    });
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected loopback test port');
    url = `http://127.0.0.1:${address.port}`;
    const dir = join(home, `.${DEFAULT_ACCOUNT_SLUG}`);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'credentials'), `[mb]\napiUrl = ${url}\napiKey = synthetic-test-key\n`, { mode: 0o600 });
  });

  afterEach(async () => {
    server?.closeAllConnections();
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
    await rm(home, { recursive: true, force: true });
  });

  function cli(args: string[]) {
    const path = fileURLToPath(new URL('../../../dist/cli/index.js', import.meta.url));
    return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [path, 'network', ...args, '--profile', 'mb'], {
        env: { HOME: home, USERPROFILE: home, PATH: process.env.PATH, TMPDIR: tmpdir() }, stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '', stderr = '';
      const timer = setTimeout(() => child.kill(), 8000);
      child.stdout.on('data', (b) => { stdout += b; }); child.stderr.on('data', (b) => { stderr += b; });
      child.once('error', (e) => { clearTimeout(timer); reject(e); });
      child.once('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
    });
  }

  it('inbox --unread --mark-read: sends the mailbox query, prints the page, says more pages on stderr, then acks the printed ids', async () => {
    const out = await cli(['inbox', '--unread', '--limit', '1', '--mark-read']);
    expect(out.code, out.stderr).toBe(0);
    const inbox = requests.find((r) => r.path === '/agnt/inbox')!;
    expect(Object.fromEntries(inbox.query)).toEqual({ view: 'received', unread: 'true', limit: '1' });
    const ack = requests.find((r) => r.path === '/agnt/ack')!;
    expect(ack.method).toBe('POST');
    expect(ack.body).toEqual({ ids: [A] });
    const got = JSON.parse(out.stdout);
    expect(got).toMatchObject({ cursor: 'CUR1', more: true, acknowledged: 1, unreadAfter: { count: 1 } });
    expect(out.stderr).toMatch(/more pages \(2 match in all\), use --cursor "CUR1"/);
    expect(out.stderr).toMatch(/marked 1 read; still 1 unread from bob@agent\.test/);
  });

  it('inbox without --mark-read never acks', async () => {
    const out = await cli(['inbox', '--from', 'bob@agent.test', '--order', 'newest', '--all', '--cursor', 'CUR0']);
    expect(out.code, out.stderr).toBe(0);
    expect(requests.some((r) => r.path === '/agnt/ack')).toBe(false);
    expect(Object.fromEntries(requests[0].query)).toEqual({ view: 'all', from: 'bob@agent.test', order: 'newest', cursor: 'CUR0' });
  });

  it('ack: --all, --thread and ids each post their one target; mixing them is refused before any request', async () => {
    expect((await cli(['ack', '--all'])).code).toBe(0);
    expect((await cli(['ack', '--thread', A])).code).toBe(0);
    expect((await cli(['ack', A, B])).code).toBe(0);
    expect(requests.filter((r) => r.path === '/agnt/ack').map((r) => r.body)).toEqual([{ all: true }, { thread: A }, { ids: [A, B] }]);
    const before = requests.length;
    const bad = await cli(['ack', A, '--all']);
    expect(bad.code).toBe(2);
    expect(bad.stderr).toMatch(/one way only/);
    expect(requests.length).toBe(before);
  });

  it('thread: the whole conversation, both directions', async () => {
    const out = await cli(['thread', A]);
    expect(out.code, out.stderr).toBe(0);
    expect(Object.fromEntries(requests[0].query)).toEqual({ view: 'all', thread: A, order: 'oldest', limit: '200' });
    expect(JSON.parse(out.stdout).messages.map((m: any) => m.direction)).toEqual(['received', 'sent']);
  });

  it('watch --print --drain prints the backlog digest line and exits', async () => {
    const out = await cli(['watch', '--print', '--drain']);
    expect(out.code, out.stderr).toBe(0);
    const lines = out.stdout.trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.map((l) => l.event)).toEqual(['watching', 'backlog', 'stopped']);
    expect(lines[1]).toMatchObject({ unread: 2, senders: { 'bob@agent.test': 2 }, ids: [A, B] });
    expect(requests.map((r) => `${r.path}?digest=${r.query.get('digest')}`)).toEqual(['/agnt/inbox?digest=true']);
  });

  describe('against a strict server that has no mailbox', () => {
    beforeEach(() => { strictOld = true; });

    it('a plain inbox still works, after one refused try', async () => {
      const out = await cli(['inbox']);
      expect(out.code, out.stderr).toBe(0);
      expect(JSON.parse(out.stdout).token).toBe('old');
      expect(requests.map((r) => r.query.has('view'))).toEqual([true, false]);
    });

    it('filters, ack and thread are not available, said plainly, never answered with the unfiltered stream', async () => {
      for (const args of [['inbox', '--unread'], ['thread', A]]) {
        const out = await cli(args);
        expect(out.code).toBe(1);
        expect(out.stdout).toBe('');
        expect(out.stderr).toMatch(/doesn't have the mailbox view yet/);
      }
      const ack = await cli(['ack', '--all']);
      expect(ack.code).toBe(1);
      expect(ack.stderr).toMatch(/doesn't offer `network ack` yet/);
    });
  });
});
