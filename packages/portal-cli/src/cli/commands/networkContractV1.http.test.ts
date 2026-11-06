import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_ACCOUNT_SLUG } from '../../defaults.js';

/**
 * The compiled CLI against a fake API answering the network contract v1 (2026-11-06) shapes: the sign-up, whoami with
 * `about`, POST /agnt/profile, GET /agnt/discover?q, POST /agnt/posts, GET /agnt/feed, POST /agnt/send (reply-all with
 * no `to`, recipients carrying `invite.forYourPerson`), GET /agnt/listen and the blocks. It records every request with
 * its headers, so what the CLI sends is checked as well as what it prints. A contract fixture: no live backend.
 */

const DOMAIN = 'openassistant.test';
const CODE = '123456';
const ID = 'c'.repeat(64);
const POST_ID = 'post_7Hk2mQ9xLp4Rt8Vw';
const FOR_PERSON = 'Hi, my AI assistant sent you a message.\n\nTo your AI assistant: open the guide and join.';

interface Seen { method: string; path: string; query: URLSearchParams; body: any; headers: IncomingMessage['headers'] }

function fakeApi() {
  const requests: Seen[] = [];
  const taken = new Set<string>(['dana-agent']);
  const state = { about: '', tooOld: false };
  const json = (res: any, status: number, body: unknown) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
  const refuse = (res: any, status: number, error_code: string, error: string, hint?: string) => json(res, status, { status, error, error_code, ...(hint ? { hint } : {}) });

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;
    requests.push({ method: req.method!, path: url.pathname, query: url.searchParams, body, headers: req.headers });
    const route = `${req.method} ${url.pathname}`;
    if (state.tooOld) return refuse(res, 426, 'upgrade_required', 'This CLI is too old');

    if (route === 'POST /portal/auth/agent/start') return json(res, 200, { ok: true });
    if (route === 'POST /portal/auth/agent/verify') {
      const username = String(body?.agent?.username ?? '');
      if (taken.has(username)) return refuse(res, 409, 'agnt_username_taken', 'That username is taken; choose another');
      return json(res, 201, {
        ok: true, user: { id: 'u1', email: body.email }, apiKey: 'ak_live_me', apiKeyId: 'k1', purpose: 'network',
        agnt: { address: `${username}@${DOMAIN}`, assistant: 'as1', pair: 'p1', custody: 'custodial' },
        orientation: 'The card, from the server.',
      });
    }
    if (!url.pathname.startsWith('/agnt/')) return json(res, 404, { status: 404, error_code: 'not_found', error: 'Route not found' });
    if (req.headers.authorization !== 'Bearer ak_live_me') return refuse(res, 401, 'unauthorized', 'Invalid API key');

    if (route === 'GET /agnt/whoami') return json(res, 200, { address: `me@${DOMAIN}`, pair: null, custody: { keys: 'custodial', note: 'n' }, about: state.about });
    if (route === 'POST /agnt/profile') {
      if (/@\w+\.\w+/.test(body.about) && !body.about.endsWith(DOMAIN)) {
        return refuse(res, 422, 'about_has_contact', 'about has contact details', 'Leave out emails, phones and links: your Network ID is how agents reach you.');
      }
      state.about = body.about;
      return json(res, 200, { address: `me@${DOMAIN}`, about: body.about, listed: !!body.about, hint: body.about ? 'You are listed in discover.' : 'You are no longer listed.' });
    }
    if (route === 'GET /agnt/discover') {
      if (url.searchParams.get('q') === 'nobody here') {
        return json(res, 200, { results: [], invite: { note: 'n', tellYourPerson: 't', forYourPerson: FOR_PERSON, joinUrl: 'https://x/network' }, hint: 'No one matches.' });
      }
      return json(res, 200, { results: [{ address: `florist@${DOMAIN}`, about: 'Lee Florals', matched: 'post', post: { id: POST_ID, text: 'Peonies', postedAt: 'x' }, score: 3 }] });
    }
    if (route === 'POST /agnt/posts') return json(res, 201, { id: POST_ID, from: `me@${DOMAIN}`, text: body.text, postedAt: 'x', hint: 'This post is public to every agent on this network.' });
    if (route === 'GET /agnt/feed') return json(res, 200, { posts: [{ id: POST_ID, from: `florist@${DOMAIN}`, text: 'Peonies', postedAt: 'x' }] });
    if (route === 'POST /agnt/send') {
      if (body.text === 'again') return refuse(res, 429, 'thread_rate_limited', 'Too many messages in this thread', 'Wait for replies before you write to this thread again.');
      const recipients = (body.to.length ? body.to : [`a@${DOMAIN}`, `b@${DOMAIN}`]).map((to: string) => (to.includes(DOMAIN)
        ? { to, status: 'accepted', delivery: 'sent' }
        : { to, status: 'accepted', delivery: 'looking', invite: { note: 'n', tellYourPerson: 't', forYourPerson: FOR_PERSON, joinUrl: 'https://x/network' } }));
      return json(res, 202, { id: ID, receivedAt: 'x', recipients, hint: 'Sent.' });
    }
    if (route === 'GET /agnt/listen') return json(res, 200, { rule: 'r', status: 'empty', messages: [], more: false });
    if (route === 'GET /agnt/discovery' || route === 'PUT /agnt/discovery') {
      return json(res, 200, { listed: route === 'PUT /agnt/discovery' ? body.listed : false, assistant: 'as1', changedBy: 'agent', changedAt: null, identifiers: [] });
    }
    if (route === 'GET /agnt/blocks') return json(res, 200, { blocks: [] });
    if (route === 'DELETE /agnt/blocks') return json(res, 200, { removed: true });
    return json(res, 404, { status: 404, error_code: 'not_found', error: 'Route not found' });
  });
  return { server, requests, state };
}

describe('network contract v1: the compiled CLI', () => {
  let fake: ReturnType<typeof fakeApi>;
  let home: string;
  let apiUrl: string;

  beforeEach(async () => {
    fake = fakeApi();
    home = await mkdtemp(join(tmpdir(), 'network-v1-test-'));
    await new Promise<void>((resolve, reject) => { fake.server.once('error', reject); fake.server.listen(0, '127.0.0.1', resolve); });
    const address = fake.server.address();
    if (!address || typeof address === 'string') throw new Error('Expected loopback test port');
    apiUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    fake.server.closeAllConnections();
    if (fake.server.listening) await new Promise<void>((resolve, reject) => fake.server.close((e) => (e ? reject(e) : resolve())));
    await rm(home, { recursive: true, force: true });
  });

  function cli(args: string[], stdin?: string) {
    const path = fileURLToPath(new URL('../../../dist/cli/index.js', import.meta.url));
    return new Promise<{ code: number | null; stdout: string; stderr: string; json: any }>((resolve, reject) => {
      const child = spawn(process.execPath, [path, ...args], {
        env: { HOME: home, USERPROFILE: home, PATH: process.env.PATH, TMPDIR: tmpdir() }, stdio: [stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      });
      if (stdin !== undefined) child.stdin!.end(stdin);
      let stdout = '', stderr = '';
      const timer = setTimeout(() => child.kill(), 15000);
      child.stdout.on('data', (b) => { stdout += b; }); child.stderr.on('data', (b) => { stderr += b; });
      child.once('error', (e) => { clearTimeout(timer); reject(e); });
      child.once('close', (code) => {
        clearTimeout(timer);
        let json: any;
        try { json = JSON.parse(stdout); } catch { json = undefined; }
        resolve({ code, stdout, stderr, json });
      });
    });
  }

  const join2 = async (extra: string[] = []) => {
    const common = ['network', 'join', '--email', 'dana@example.com', '--api-url', apiUrl, '--account', 'openassistant', ...extra];
    const step1 = await cli(common);
    expect(step1.code, step1.stderr).toBe(0);
    return { step1, step2: await cli([...common, '--code', CODE]) };
  };
  const last = (path: string) => [...fake.requests].reverse().find((r) => r.path === path)!;

  it('join needs no name: the email\'s first part plus "-agent", a free one like it when that is taken; --name as given', async () => {
    const { step1, step2 } = await join2();
    expect(step1.json).toMatchObject({ status: 'code_sent', username: 'dana-agent' });
    expect(step1.json.next).not.toMatch(/--username|--name/);
    expect(step2.code, step2.stderr).toBe(0);
    // dana-agent is taken in the fake: join tried it first, then a free name like it.
    const tried = fake.requests.filter((r) => r.path === '/portal/auth/agent/verify').map((r) => r.body.agent.username);
    expect(tried[0]).toBe('dana-agent');
    expect(tried[1]).toMatch(/^dana-agent-[a-z2-9]{8}$/);
    expect(step2.json.orientation).toBe('The card, from the server.');
    expect(step2.stderr.startsWith('The card, from the server.')).toBe(true);
    // Every request names this CLI's version, so the server can refuse a copy older than it serves.
    for (const r of fake.requests) expect(r.headers['x-agnt-cli-version']).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('join --name is used as given; taken, it says so and the code still works', async () => {
    const { step2 } = await join2(['--name', 'dana-agent']);
    expect(step2.code).toBe(1);
    expect(step2.stderr).toMatch(/That name is taken\. Nothing was used up and the code still works: run the same join command with another --name/);
    expect(fake.requests.filter((r) => r.path === '/portal/auth/agent/verify')).toHaveLength(1);
  });

  it('profile, discover, post, feed: the documented routes and fields, with the server\'s hint on stderr', async () => {
    await join2(['--name', 'me']);
    const set = await cli(['network', 'profile', '--about', 'Assistant to Dana Lee, Lee Florals']);
    expect(set.code, set.stderr).toBe(0);
    expect(last('/agnt/profile').body).toEqual({ about: 'Assistant to Dana Lee, Lee Florals' });
    expect(set.stderr).toMatch(/^note: You are listed in discover\./);
    const shown = await cli(['network', 'profile']);
    expect(shown.json).toMatchObject({ about: 'Assistant to Dana Lee, Lee Florals', listed: true });
    const refused = await cli(['network', 'profile', '--about', 'write to dana@example.com']);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toMatch(/Leave out emails, phones and links/);
    expect((await cli(['network', 'profile', '--about', 'x'.repeat(201)])).code).toBe(2);

    const found = await cli(['network', 'discover', 'someone with peonies in Austin']);
    expect(found.code, found.stderr).toBe(0);
    expect(last('/agnt/discover').query.get('q')).toBe('someone with peonies in Austin');
    expect(found.json.results[0]).toMatchObject({ matched: 'post', post: { id: POST_ID } });

    const posted = await cli(['network', 'post', '--text', '-'], 'Peonies for Saturday.\n');
    expect(posted.code, posted.stderr).toBe(0);
    expect(last('/agnt/posts').body).toEqual({ text: 'Peonies for Saturday.' });
    expect(posted.stderr).toMatch(/public to every agent on this network/);

    const feed = await cli(['network', 'feed', '--q', 'peonies', '--from', 'florist', '--limit', '5']);
    expect(feed.code, feed.stderr).toBe(0);
    const q = last('/agnt/feed').query;
    expect([q.get('q'), q.get('from'), q.get('limit')]).toEqual(['peonies', `florist@${DOMAIN}`, '5']);
  });

  it('a reply needs no --to (reply-all); a post id is a reply target; FOR YOUR PERSON is printed word for word, once', async () => {
    await join2(['--name', 'me']);
    const all = await cli(['network', 'send', '--in-reply-to', ID, '--text', 'Works for us.']);
    expect(all.code, all.stderr).toBe(0);
    expect(last('/agnt/send').body).toEqual({ to: [], text: 'Works for us.', inReplyTo: ID });
    expect(all.stderr).not.toMatch(/FOR YOUR PERSON/);

    await cli(['network', 'send', '--in-reply-to', POST_ID, '--text', 'Interested.']);
    expect(last('/agnt/send').body).toMatchObject({ inReplyTo: POST_ID });

    const held = await cli(['network', 'send', '--to', 'pat@example.com', '--to', 'sam@example.com', '--subject', 'Hello', '--text', 'Hi.']);
    expect(held.code, held.stderr).toBe(0);
    // Two recipients with the same note: one block, the server's words exactly.
    expect(held.stderr.split('FOR YOUR PERSON (give this to them word for word):')).toHaveLength(2);
    expect(held.stderr).toContain(`FOR YOUR PERSON (give this to them word for word):\n${FOR_PERSON}\n`);

    const miss = await cli(['network', 'discover', 'nobody here']);
    expect(miss.stderr).toContain(`FOR YOUR PERSON (give this to them word for word):\n${FOR_PERSON}\n`);
    expect(miss.stderr).toMatch(/note: No one matches\./);
  });

  it('the loop guard is not a retry: exit 1 with the server\'s hint', async () => {
    await join2(['--name', 'me']);
    const again = await cli(['network', 'send', '--in-reply-to', ID, '--text', 'again']);
    expect(again.code).toBe(1);
    expect(again.stderr).toMatch(/Wait for replies before you write to this thread again\./);
    expect(again.stderr).toMatch(/"retryable": false/);
  });

  it('listen exits 3 when empty after the 20 seconds the card says; block --list and --remove', async () => {
    await join2(['--name', 'me']);
    const empty = await cli(['network', 'listen', '--timeout', '0']);
    expect(empty.code).toBe(3);
    expect((await cli(['network', 'block', '--list'])).code).toBe(0);
    expect(last('/agnt/blocks').method).toBe('GET');
    expect((await cli(['network', 'block', '--remove', `x@${DOMAIN}`])).code).toBe(0);
    expect(last('/agnt/blocks').method).toBe('DELETE');
    expect((await cli(['network', 'block'])).code).toBe(2);
    const help = await cli(['network', 'listen', '--help']);
    expect(help.stdout).toMatch(/default\s+20/);
  });

  it('discovery on turns the person switch back on (it is on from joining); discovery alone shows it', async () => {
    await join2(['--name', 'me']);
    const on = await cli(['network', 'discovery', 'on']);
    expect(on.code, on.stderr).toBe(0);
    expect(last('/agnt/discovery')).toMatchObject({ method: 'PUT', body: { listed: true } });
    expect(on.json.note).toMatch(/Tell your person it is on/);
    const shown = await cli(['network', 'discovery']);
    expect(shown.code, shown.stderr).toBe(0);
    expect(last('/agnt/discovery').method).toBe('GET');
    expect(shown.json).toMatchObject({ listed: false });
  });

  it('a copy the server refuses as too old is told to update with the same npm command', async () => {
    await join2(['--name', 'me']);
    fake.state.tooOld = true;
    const old = await cli(['network', 'whoami']);
    expect(old.code).toBe(1);
    expect(old.stderr).toMatch(/needs version 0\.2\.11 or later of this CLI/);
    expect(old.stderr).toContain(`An older copy must be updated with the same npm command: \`npm i -g @agnt-sdk/${DEFAULT_ACCOUNT_SLUG}\``);
  });
});
