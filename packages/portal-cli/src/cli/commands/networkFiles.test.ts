import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PortalClient } from '../../index.js';
import { AgntApiError } from '../../HttpClient.js';
import {
  FILE_BYTES, FilesUsageError, MAX_FILES, MESSAGE_BYTES, PartsError, downloadPartTo, hashFile, mediaTypeFor, planFiles, plainFileName, uploadFiles,
  uploadUrlProblem, type PlannedFile,
} from './networkFiles.js';
import { networkSend, sendBodyFrom, describeError } from './network.js';

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const MiB = 1024 * 1024;

/** A fake API and a fake network server (the signed upload's host) on one real loopback port. */
interface Fake {
  base: string;
  /** Every request: method, path, headers, parsed JSON body (when JSON) or the raw bytes. */
  calls: Array<{ method: string; path: string; headers: IncomingMessage['headers']; json?: any; raw?: Buffer }>;
  uploaded: Map<string, Buffer>;
  mode: {
    partsStatus?: number;
    putStatus?: number;
    expiresAt?: () => string;
    uploadUrl?: (base: string, sha: string) => string;
    download?: (id: string) => { status: number; body?: Buffer | string; headers?: Record<string, string>; json?: unknown; stream?: 'chunked' | 'hang' };
    sendStatus?: number;
  };
}

function startFake(): Promise<{ fake: Fake; server: Server }> {
  const fake: Fake = { base: '', calls: [], uploaded: new Map(), mode: {} };
  const used = new Set<string>();
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks);
    const url = new URL(req.url!, 'http://127.0.0.1');
    const call: Fake['calls'][number] = { method: req.method!, path: url.pathname, headers: req.headers };
    const isJson = (req.headers['content-type'] ?? '').includes('application/json');
    if (isJson && raw.length) call.json = JSON.parse(raw.toString('utf8'));
    else call.raw = raw;
    fake.calls.push(call);
    const json = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
      res.end(JSON.stringify(body));
    };
    const route = `${req.method} ${url.pathname}`;

    if (route === 'POST /agnt/parts') {
      if (fake.mode.partsStatus === 429) return json(429, { status: 429, error: 'too many file uploads from this agent today; try again tomorrow', error_code: 'rate_limited' }, { 'Retry-After': '3600' });
      const body = call.json ?? {};
      if (!Object.keys(body).every((k) => ['sha256', 'size', 'assistant'].includes(k))) return json(400, { status: 400, error: 'Unrecognized key', error_code: 'bad_request' });
      if (!/^[0-9a-f]{64}$/.test(body.sha256) || !Number.isInteger(body.size) || body.size > FILE_BYTES) return json(400, { status: 400, error: 'bad part', error_code: 'bad_request' });
      const expiresAt = fake.mode.expiresAt ? fake.mode.expiresAt() : new Date(Date.now() + 300_000).toISOString();
      const upload = fake.mode.uploadUrl ? fake.mode.uploadUrl(fake.base, body.sha256) : `${fake.base}/simon/parts/${body.sha256}?sig=${used.size}`;
      return json(200, { upload: { method: 'PUT', url: upload, headers: { 'x-signature': `sig-${body.sha256.slice(0, 6)}`, 'x-nonce': `n${fake.calls.length}` }, expiresAt }, part: { sha256: body.sha256, size: body.size } });
    }
    if (req.method === 'PUT' && url.pathname.startsWith('/simon/parts/')) {
      const id = url.pathname.split('/').pop()!;
      if (fake.mode.putStatus) return json(fake.mode.putStatus, { error: 'refused', error_code: 'signature_expired' });
      // The signature binds exactly these bytes, once.
      if (sha(raw) !== id) return json(400, { error: 'the bytes are not the ones named', error_code: 'hash_mismatch' });
      if (used.has(String(req.headers['x-nonce']))) return json(401, { error: 'used', error_code: 'signature_used' });
      used.add(String(req.headers['x-nonce']));
      fake.uploaded.set(id, raw);
      res.statusCode = 204;
      return res.end();
    }
    if (route === 'POST /agnt/send') {
      if (fake.mode.sendStatus) return json(fake.mode.sendStatus, { status: fake.mode.sendStatus, error: 'refused', error_code: 'held_parts_unsupported', details: { field: 'parts' } });
      const body = call.json ?? {};
      if (body.text === undefined && !(body.parts?.length)) return json(400, { status: 400, error: 'a message needs text or parts', error_code: 'bad_request' });
      for (const p of body.parts ?? []) if (typeof p.sha256 === 'string' && !fake.uploaded.has(p.sha256)) return json(400, { status: 400, error: 'This server holds no such part.', error_code: 'part_not_uploaded', details: { field: 'parts[0]' } });
      return json(200, { id: 'a'.repeat(64), receivedAt: '2026-11-11T00:00:00.000Z', recipients: (body.to ?? []).map((to: string) => ({ to, status: 'accepted', delivery: 'sent' })) });
    }
    if (req.method === 'GET' && url.pathname.startsWith('/agnt/parts/')) {
      const id = url.pathname.split('/').pop()!;
      const answer = fake.mode.download?.(id) ?? { status: 404, json: { status: 404, error: 'no such file for this agent', error_code: 'not_found' } };
      res.statusCode = answer.status;
      for (const [k, v] of Object.entries(answer.headers ?? {})) res.setHeader(k, v);
      if (answer.json !== undefined) { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(answer.json)); }
      res.setHeader('Content-Type', 'application/octet-stream');
      // No length announced (chunked), or a length announced and then no more bytes.
      if (answer.stream === 'chunked') { const b = Buffer.from(answer.body ?? ''); res.write(b.subarray(0, 10)); return setTimeout(() => res.end(b.subarray(10)), 20); }
      if (answer.stream === 'hang') { res.setHeader('Content-Length', '100'); return void res.write('x'); }
      return res.end(answer.body);
    }
    if (route === 'GET /agnt/whoami') return json(200, { address: 'me@openassistant.test' });
    return json(404, { status: 404, error: 'Route not found', error_code: 'not_found' });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    fake.base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    resolve({ fake, server });
  }));
}

describe('network files', () => {
  let fake: Fake;
  let server: Server;
  let client: PortalClient;
  let dir: string;
  const file = (name: string, content: Buffer | string) => { const p = join(dir, name); writeFileSync(p, content); return p; };
  const planned = (p: string, name = p.split('/').pop()!): PlannedFile => ({ path: p, name, type: mediaTypeFor(name), size: statSync(p).size });

  beforeEach(async () => {
    ({ fake, server } = await startFake());
    client = new PortalClient({ apiUrl: fake.base, apiKey: 'test-key' });
    dir = mkdtempSync(join(tmpdir(), 'network-files-test-'));
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  });

  describe('planFiles', () => {
    it('plans each file by its base name, with a media type from the extension and its size', () => {
      const a = file('contract.pdf', 'abc');
      const b = file('notes', 'xy');
      expect(planFiles([a, b])).toEqual([
        { path: a, name: 'contract.pdf', type: 'application/pdf', size: 3 },
        { path: b, name: 'notes', type: 'application/octet-stream', size: 2 },
      ]);
      expect(planFiles(undefined)).toEqual([]);
      expect(mediaTypeFor('Photo.JPG')).toBe('image/jpeg');
      expect(mediaTypeFor('.hidden')).toBe('application/octet-stream');
    });

    it('refuses a file over 25 MiB, naming it, without touching the network', () => {
      const big = (p: string) => ({ isFile: () => true, size: FILE_BYTES + 1 }) as any;
      expect(() => planFiles(['/x/big.bin'], 0, big)).toThrow(/big\.bin is 25\.0 MiB; a file on the network is at most 25 MiB/);
      // Exactly 25 MiB is fine.
      expect(planFiles(['/x/ok.bin'], 0, () => ({ isFile: () => true, size: FILE_BYTES }) as any)).toHaveLength(1);
    });

    it('refuses more than 31 files, and a message over 50 MiB with the text counted in', () => {
      const same = () => ({ isFile: () => true, size: 1 }) as any;
      expect(planFiles(Array.from({ length: MAX_FILES }, (_, i) => `/f/${i}`), 0, same)).toHaveLength(31);
      expect(() => planFiles(Array.from({ length: MAX_FILES + 1 }, (_, i) => `/f/${i}`), 0, same)).toThrow(/at most 31 files; 32 were given/);
      const quarter = () => ({ isFile: () => true, size: FILE_BYTES }) as any;
      expect(planFiles(['/f/a', '/f/b'], 0, quarter)).toHaveLength(2); // exactly 50 MiB
      expect(() => planFiles(['/f/a', '/f/b'], 1, quarter)).toThrow(/50 MiB/);
      expect(() => planFiles(['/f/a', '/f/b', '/f/c'], 0, quarter)).toThrow(/at most 50 MiB/);
      expect(MESSAGE_BYTES).toBe(2 * FILE_BYTES);
    });

    it('refuses a missing path, a folder and an empty name, as usage errors', () => {
      expect(() => planFiles([join(dir, 'nope.txt')])).toThrow(FilesUsageError);
      expect(() => planFiles([dir])).toThrow(/is not a file/);
      expect(() => planFiles([' '])).toThrow(/takes the path of a file your person asked/);
    });
  });

  describe('hashFile', () => {
    it('hashes the exact bytes as a stream, including none and more than one chunk', async () => {
      expect(await hashFile(file('abc', 'abc'))).toEqual({ sha256: sha('abc'), size: 3 });
      expect(await hashFile(file('empty', ''))).toEqual({ sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', size: 0 });
      const big = Buffer.alloc(3 * MiB + 17, 7);
      expect(await hashFile(file('big', big))).toEqual({ sha256: sha(big), size: big.length });
    });
  });

  describe('uploadFiles: the upload dance against a fake server', () => {
    it('asks for the signed upload by hash and size, PUTs the bytes with exactly the headers it gave and never the API key, and answers the part', async () => {
      const f = file('contract.pdf', 'file bytes');
      const parts = await uploadFiles(client, [planned(f)], { assistant: 'as1' });
      expect(parts).toEqual([{ type: 'application/pdf', sha256: sha('file bytes'), size: 10, name: 'contract.pdf' }]);
      const [post, put] = fake.calls;
      expect([post.method, post.path, post.json]).toEqual(['POST', '/agnt/parts', { sha256: sha('file bytes'), size: 10, assistant: 'as1' }]);
      expect(post.headers.authorization).toBe('Bearer test-key');
      expect([put.method, put.path]).toEqual(['PUT', `/simon/parts/${sha('file bytes')}`]);
      expect(put.headers['x-signature']).toBe(`sig-${sha('file bytes').slice(0, 6)}`);
      expect(put.headers['content-length']).toBe('10');
      // The signed host needs only its signature: not the key, not the version header.
      expect(put.headers.authorization).toBeUndefined();
      expect(put.headers['x-agnt-cli-version']).toBeUndefined();
      expect(fake.uploaded.get(sha('file bytes'))!.toString()).toBe('file bytes');
    });

    it('uploads an empty file, and a file given twice only once', async () => {
      const empty = file('empty.txt', '');
      const a = file('a.txt', 'same'), b = file('b.txt', 'same');
      const parts = await uploadFiles(client, [planned(empty), planned(a), planned(b)]);
      expect(parts.map((p) => p.name)).toEqual(['empty.txt', 'a.txt', 'b.txt']);
      expect(fake.calls.filter((c) => c.method === 'PUT').map((c) => c.path)).toEqual([`/simon/parts/${sha('')}`, `/simon/parts/${sha('same')}`]);
      expect(fake.calls.filter((c) => c.path === '/agnt/parts')).toHaveLength(2);
    });

    it('streams a file larger than one chunk intact', async () => {
      const big = Buffer.alloc(5 * MiB + 3);
      for (let i = 0; i < big.length; i += 4099) big[i] = i % 251;
      await uploadFiles(client, [planned(file('big.bin', big))]);
      expect(sha(fake.uploaded.get(sha(big))!)).toBe(sha(big));
    });

    it('a 429 on the signed upload is the day\'s limit: retryAfter and its own hint, and nothing was uploaded', async () => {
      fake.mode.partsStatus = 429;
      const err = await uploadFiles(client, [planned(file('a.txt', 'x'))]).catch((e) => e);
      expect(err).toBeInstanceOf(AgntApiError);
      expect(err).toMatchObject({ status: 429, errorCode: 'rate_limited', retryAfter: 3600 });
      expect(fake.calls.some((c) => c.method === 'PUT')).toBe(false);
      const { body, exitCode } = describeError('send', err);
      expect(exitCode).toBe(75);
      expect(body).toMatchObject({ code: 'rate_limited', retryable: true, retryAfter: 3600 });
      expect(body.hint).toMatch(/files this agent may upload today.*Nothing was sent/);
    });

    it('an expired signed upload (its time already past) is refused before the PUT, and says to run it again once', async () => {
      fake.mode.expiresAt = () => new Date(Date.now() - 1000).toISOString();
      const err = await uploadFiles(client, [planned(file('a.txt', 'x'))]).catch((e) => e);
      expect(err).toBeInstanceOf(PartsError);
      expect(err.code).toBe('upload_expired');
      expect(fake.calls.some((c) => c.method === 'PUT')).toBe(false);
      const { body, exitCode } = describeError('send', err);
      expect(exitCode).toBe(75);
      expect(body).toMatchObject({ code: 'upload_expired', retryable: true });
      expect(body.hint).toMatch(/Run the same command once: it signs and uploads again/);
    });

    it('a PUT the server refuses (the URL ran out, or was used) is upload_refused with its status, to run again once; a 5xx is upload_failed', async () => {
      fake.mode.putStatus = 403;
      const refused = await uploadFiles(client, [planned(file('a.txt', 'x'))]).catch((e) => e);
      expect(refused).toBeInstanceOf(PartsError);
      expect(describeError('send', refused)).toMatchObject({
        exitCode: 75, body: { code: 'upload_refused', status: 403, retryable: true },
      });
      expect(describeError('send', refused).body.hint).toMatch(/good once, for about five minutes.*Nothing was sent/);
      fake.mode.putStatus = 503;
      const failed = await uploadFiles(client, [planned(file('b.txt', 'y'))]).catch((e) => e);
      expect(describeError('send', failed).body).toMatchObject({ code: 'upload_failed', status: 503, retryable: true });
    });

    it('a signed upload that is not https (or loopback http), or not a PUT, is never used', async () => {
      fake.mode.uploadUrl = () => 'http://uploads.example.net/part';
      const err = await uploadFiles(client, [planned(file('a.txt', 'x'))]).catch((e) => e);
      expect(err).toMatchObject({ code: 'upload_refused', extra: { retryable: false } });
      expect(fake.calls.some((c) => c.method === 'PUT')).toBe(false);
      expect(uploadUrlProblem('https://simon.example.net/parts/abc')).toBeUndefined();
      expect(uploadUrlProblem('http://127.0.0.1:9/p')).toBeUndefined();
      expect(uploadUrlProblem('http://localhost.evil.test/p')).toMatch(/not an https/);
      expect(uploadUrlProblem('file:///etc/passwd')).toMatch(/not an https/);
      expect(uploadUrlProblem('nonsense')).toMatch(/not an address/);
    });

    it('a file that changed size between the plan and the upload is refused, nothing sent', async () => {
      const f = file('a.txt', 'abcdef');
      const err = await uploadFiles(client, [{ ...planned(f), size: 3 }]).catch((e) => e);
      expect(err).toMatchObject({ code: 'file_changed' });
      expect(fake.calls).toHaveLength(0);
    });

    it('a PUT of other bytes than were named is refused by the server (the signature binds the hash)', async () => {
      // The fake checks the body against the hash in the URL, as the network server does.
      const prepared = await client.network.uploadPart(sha('one'), 3);
      await expect(client.network.putPart(prepared.upload, Buffer.from('two'), 3)).rejects.toMatchObject({ status: 400 });
      expect(fake.uploaded.size).toBe(0);
    });
  });

  describe('send with files', () => {
    it('a parts-only send: no text key, the file named by hash, size, type and name; the answer lists the files; the file went first', async () => {
      const f = file('contract.pdf', 'pdf bytes');
      const out = await networkSend(client, { to: ['bob@openassistant.test'], file: [f], subject: 'The contract' }, { processes: async () => [] });
      const send = fake.calls.find((c) => c.path === '/agnt/send')!;
      expect(send.json).toEqual({
        to: ['bob@openassistant.test'], headers: { subject: 'The contract' },
        parts: [{ type: 'application/pdf', sha256: sha('pdf bytes'), size: 9, name: 'contract.pdf' }],
      });
      expect('text' in send.json).toBe(false);
      const order = fake.calls.map((c) => `${c.method} ${c.path.replace(/[0-9a-f]{64}/, '<sha>')}`);
      expect(order.indexOf('POST /agnt/parts')).toBeLessThan(order.indexOf('PUT /simon/parts/<sha>'));
      expect(order.indexOf('PUT /simon/parts/<sha>')).toBeLessThan(order.indexOf('POST /agnt/send'));
      expect(out.result).toMatchObject({ id: 'a'.repeat(64), files: [{ name: 'contract.pdf', sha256: sha('pdf bytes') }] });
    });

    it('text and several files together; the text still goes as text', async () => {
      const a = file('a.png', 'AAA'), b = file('b.csv', 'x,y');
      await networkSend(client, { to: ['bob@openassistant.test'], text: 'Attached.', file: [a, b], subject: 'Two' }, { processes: async () => [] });
      const send = fake.calls.find((c) => c.path === '/agnt/send')!;
      expect(send.json.text).toBe('Attached.');
      expect(send.json.parts.map((p: any) => [p.type, p.name])).toEqual([['image/png', 'a.png'], ['text/csv', 'b.csv']]);
    });

    it('a reply may be parts-only too', async () => {
      const f = file('a.txt', 'hi');
      await networkSend(client, { inReplyTo: 'c'.repeat(64), file: [f] }, { processes: async () => [] });
      const send = fake.calls.find((c) => c.path === '/agnt/send')!;
      expect(send.json).toMatchObject({ to: [], inReplyTo: 'c'.repeat(64) });
      expect(send.json.parts).toHaveLength(1);
    });

    it('a message with neither text nor a file is a usage error; with a file it needs no text; --text - is read once', () => {
      expect(() => sendBodyFrom({ to: ['bob@openassistant.test'], subject: 's' })).toThrow(/Give --text.*or a --file/);
      expect(sendBodyFrom({ to: ['bob@openassistant.test'], subject: 's', file: ['x'] })).toEqual({ to: ['bob@openassistant.test'], headers: { subject: 's' } });
      let reads = 0;
      const body = sendBodyFrom({ to: ['bob@openassistant.test'], subject: 's', text: '-' }, () => { reads++; return 'from stdin'; });
      expect([body.text, reads]).toEqual(['from stdin', 1]);
    });

    it('files to a phone or a mailto: are refused before anything is uploaded; so is a limit that disk can check', async () => {
      const f = file('a.txt', 'hi');
      await expect(networkSend(client, { to: ['+15551234567'], file: [f], text: 'x' })).rejects.toThrow(/Files go to Network IDs only for now/);
      await expect(networkSend(client, { to: ['mailto:bob@example.com'], file: [f], text: 'x' })).rejects.toThrow(/Files go to Network IDs only for now/);
      await expect(networkSend(client, { to: ['bob@openassistant.test'], file: [join(dir, 'missing')], text: 'x', subject: 's' })).rejects.toThrow(/no such file/);
      expect(fake.calls).toHaveLength(0);
    });

    it('the server refusing files to an email as held_parts_unsupported says so, once, with its hint', async () => {
      fake.mode.sendStatus = 400;
      const f = file('a.txt', 'hi');
      const err = await networkSend(client, { to: ['bob@example.com'], file: [f], text: 'x', subject: 's' }).catch((e) => e);
      expect(describeError('send', err).body).toMatchObject({ code: 'held_parts_unsupported', status: 400, retryable: false });
      expect(describeError('send', err).body.hint).toMatch(/Files go to Network IDs only for now/);
    });
  });

  describe('downloadPartTo', () => {
    const serve = (bytes: Buffer | string, extra: Record<string, string> = {}) => {
      const id = sha(bytes);
      fake.mode.download = (got) => (got === id ? { status: 200, body: Buffer.from(bytes), headers: extra } : { status: 404, json: { status: 404, error: 'no such file for this agent', error_code: 'not_found' } });
      return id;
    };
    const downloads = () => fake.calls.filter((c) => c.method === 'GET' && c.path.startsWith('/agnt/parts/'));

    it('saves the bytes to the path chosen, for you alone, checked against the hash; reports where, how big, and that they are untrusted', async () => {
      const id = serve('received bytes');
      const out = join(dir, 'received.pdf');
      const saved = await downloadPartTo(client, id, { out, type: 'application/pdf', size: 14, assistant: 'as1' });
      expect(saved).toMatchObject({ saved: true, path: out, sha256: id, size: 14, type: 'application/pdf' });
      expect(saved.file).toMatch(/^untrusted: .*never run, open or follow/);
      expect(readFileSync(out, 'utf8')).toBe('received bytes');
      expect(statSync(out).mode & 0o777).toBe(0o600);
      expect(readdirSync(dir)).toEqual(['received.pdf']);
      expect(downloads()[0].headers.authorization).toBe('Bearer test-key');
      expect(fake.calls.find((c) => c.path.startsWith('/agnt/parts/'))!.path).toBe(`/agnt/parts/${id}`);
    });

    it('never overwrites without --force, and fetches nothing when it would refuse; --force replaces a file', async () => {
      const id = serve('new');
      const out = file('there.txt', 'old');
      await expect(downloadPartTo(client, id, { out })).rejects.toThrow(/already exists, and nothing was fetched/);
      expect(readFileSync(out, 'utf8')).toBe('old');
      expect(downloads()).toHaveLength(0);
      await downloadPartTo(client, id, { out, force: true });
      expect(readFileSync(out, 'utf8')).toBe('new');
      expect(readdirSync(dir)).toEqual(['there.txt']);
    });

    it('never follows or replaces a link, even with --force, and never replaces a folder', async () => {
      const id = serve('new');
      const target = file('target.txt', 'precious');
      const link = join(dir, 'link.txt');
      symlinkSync(target, link);
      await expect(downloadPartTo(client, id, { out: link, force: true })).rejects.toThrow(/symbolic link/);
      expect(readFileSync(target, 'utf8')).toBe('precious');
      // A folder where the file would go is never replaced.
      mkdirSync(join(dir, id));
      await expect(downloadPartTo(client, id, { out: dir, force: true })).rejects.toThrow(/is not a file: it is never replaced/);
      expect(statSync(join(dir, id)).isDirectory()).toBe(true);
    });

    it('a hash mismatch keeps nothing: no file, no temporary file', async () => {
      const id = sha('what was asked for');
      fake.mode.download = () => ({ status: 200, body: Buffer.from('something else entirely') });
      const out = join(dir, 'x.bin');
      const err = await downloadPartTo(client, id, { out }).catch((e) => e);
      expect(err).toBeInstanceOf(PartsError);
      expect(describeError('part', err)).toMatchObject({ exitCode: 1, body: { code: 'part_mismatch', status: 502, retryable: false } });
      expect(readdirSync(dir)).toEqual([]);
    });

    it('a size that is not the one the part names is refused too; and one announced past the limit is refused before reading', async () => {
      const id = serve('four');
      await expect(downloadPartTo(client, id, { out: join(dir, 'a'), size: 5 })).rejects.toMatchObject({ code: 'part_mismatch' });
      expect(readdirSync(dir)).toEqual([]);
      await expect(downloadPartTo(client, id, { out: join(dir, 'b'), size: FILE_BYTES + 1 })).rejects.toThrow(/at most 25 MiB/);
      // A body bigger than the size given stops reading at the limit.
      fake.mode.download = () => ({ status: 200, body: Buffer.alloc(100) });
      await expect(downloadPartTo(client, sha(Buffer.alloc(100)), { out: join(dir, 'c'), size: 10 })).rejects.toMatchObject({ code: 'part_mismatch' });
      expect(readdirSync(dir)).toEqual([]);
    });

    it('a body with no announced length that runs past the size stops being read at the limit; an announced length past it is refused without waiting for the bytes', async () => {
      fake.mode.download = () => ({ status: 200, body: Buffer.alloc(100), stream: 'chunked' });
      await expect(downloadPartTo(client, sha(Buffer.alloc(100)), { out: join(dir, 'c'), size: 10 })).rejects.toMatchObject({ code: 'part_mismatch', message: expect.stringMatching(/larger than 10 bytes/) });
      fake.mode.download = () => ({ status: 200, stream: 'hang' });
      await expect(downloadPartTo(client, sha('x'), { out: join(dir, 'd'), size: 10 })).rejects.toMatchObject({ code: 'part_mismatch', message: expect.stringMatching(/announced 100 bytes/) });
      expect(readdirSync(dir)).toEqual([]);
    }, 3000);

    it('a directory: the file is saved inside it as its sha256, or as a plain --name you chose', async () => {
      const id = serve('dirbytes');
      const saved = await downloadPartTo(client, id, { out: dir });
      expect(saved.path).toBe(join(dir, id));
      const named = await downloadPartTo(client, id, { out: dir, name: 'chosen.txt' });
      expect(named.path).toBe(join(dir, 'chosen.txt'));
      expect(readdirSync(dir).sort()).toEqual([id, 'chosen.txt'].sort());
    });

    it('a name that is a path never lands outside the chosen directory: it is refused before anything is fetched', async () => {
      const id = serve('x');
      const inner = join(dir, 'inner');
      mkdirSync(inner);
      for (const name of ['../escape.txt', '..', '.', 'a/b', '/etc/passwd', 'a\\b', '', 'x\u0000y', 'x\ny', 'n'.repeat(256)]) {
        await expect(downloadPartTo(client, id, { out: inner, name }), JSON.stringify(name)).rejects.toThrow(FilesUsageError);
      }
      expect(() => plainFileName('../x')).toThrow(/never a path/);
      expect(() => plainFileName('..')).toThrow(/never a path/);
      expect(() => plainFileName('.')).toThrow(/never a path/);
      expect(plainFileName('contract (final).pdf')).toBe('contract (final).pdf');
      expect(downloads()).toHaveLength(0);
      expect(existsSync(join(dir, 'escape.txt'))).toBe(false);
      expect(readdirSync(inner)).toEqual([]);
    });

    it('--name needs a directory, and a missing directory or a trailing slash is refused up front', async () => {
      const id = serve('x');
      await expect(downloadPartTo(client, id, { out: join(dir, 'f.txt'), name: 'n.txt' })).rejects.toThrow(/--name goes with --out <an existing directory>/);
      await expect(downloadPartTo(client, id, { out: join(dir, 'nodir', 'f.txt') })).rejects.toThrow(/directory for --out .* does not exist/);
      await expect(downloadPartTo(client, id, { out: join(dir, 'newdir') + '/' })).rejects.toThrow(/does not exist: make it first/);
      expect(downloads()).toHaveLength(0);
    });

    it('with no --out the file goes in a new private folder in the temp directory; a failure leaves no folder behind', async () => {
      const id = serve('tmp bytes');
      const saved = await downloadPartTo(client, id, {});
      const folder = dirname(saved.path);
      try {
        expect(folder.startsWith(tmpdir()) || folder.startsWith('/private' + tmpdir())).toBe(true);
        expect(saved.path).toBe(join(folder, id));
        expect(statSync(folder).mode & 0o777).toBe(0o700);
        expect(statSync(saved.path).mode & 0o777).toBe(0o600);
        expect(readFileSync(saved.path, 'utf8')).toBe('tmp bytes');
      } finally {
        rmSync(folder, { recursive: true, force: true });
      }
      const bad = sha('wanted');
      fake.mode.download = () => ({ status: 200, body: 'other' });
      const before = readdirSync(tmpdir()).filter((n) => n.includes('-part-'));
      await expect(downloadPartTo(client, bad, {})).rejects.toMatchObject({ code: 'part_mismatch' });
      expect(readdirSync(tmpdir()).filter((n) => n.includes('-part-'))).toEqual(before);
    });

    it('refuses a malformed sha256 or size without a request', async () => {
      await expect(downloadPartTo(client, 'ABC', {})).rejects.toThrow(/64 lower-case hex digits/);
      await expect(downloadPartTo(client, sha('x'), { size: -1 })).rejects.toThrow(/whole number/);
      expect(fake.calls).toHaveLength(0);
    });

    it.each([
      [404, { status: 404, error: 'no such file for this agent', error_code: 'not_found' }, 1, /did not receive it, or its message is held/],
      [503, { status: 503, error: 'still arriving', error_code: 'unavailable' }, 75, /still arriving/],
      [507, { status: 507, error: 'locked', error_code: 'needs_more_space' }, 1, /free up space or upgrade.*nothing needs to be sent again/],
      [410, { status: 410, error: 'gone', error_code: 'file_not_kept' }, 1, /sender can send it again/],
      [501, { status: 501, error: 'no streaming', error_code: 'agnt_parts_need_streaming' }, 1, /does not serve file downloads yet/],
    ])('a %s answer keeps nothing and maps to its hint and exit status', async (status, json, exitCode, hint) => {
      fake.mode.download = () => ({ status, json });
      const out = join(dir, 'x');
      const err = await downloadPartTo(client, sha('x'), { out }).catch((e) => e);
      const described = describeError('part', err);
      expect(described.exitCode).toBe(exitCode);
      expect(described.body.hint).toMatch(hint);
      expect(described.body.retryable).toBe(exitCode === 75);
      expect(readdirSync(dir)).toEqual([]);
    });
  });
});
