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
  const state = { about: '', tooOld: false, contactsLimited: false };
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
    if (route === 'GET /agnt/discover/contacts') {
      if (state.contactsLimited) { res.setHeader('Retry-After', '40000'); return json(res, 429, { status: 429, error: 'too many discover calls; try again later', error_code: 'rate_limited' }); }
      const cursor = url.searchParams.get('cursor');
      return json(res, 200, cursor
        ? { matches: [], checked: 4, capped: false, cursor: null }
        : { matches: [{ contact: 'Dana', address: `dana@${DOMAIN}`, name: 'Dana', domain: DOMAIN, degree: 1, mutualConnections: 0, connection: 'connected', workspace: true }], checked: 50, capped: true, cursor: 'f'.repeat(24) });
    }
    if (route === 'GET /agnt/discover' && (url.searchParams.has('email') || url.searchParams.has('phone'))) {
      const email = url.searchParams.get('email');
      if (email === 'limit@example.com') { res.setHeader('Retry-After', '90'); return json(res, 429, { status: 429, error: 'too many discover calls; try again later', error_code: 'rate_limited' }); }
      // Zod-level failures (a length) answer bad_request, as the real API's validateInput does; the service's own refusals answer invalid.
      if ((email?.length ?? 0) > 320) return refuse(res, 400, 'bad_request', 'email: String must contain at most 320 character(s)');
      if (url.searchParams.get('phone') === '+15555550199') return refuse(res, 400, 'invalid', 'phone is an E.164 phone number');
      if (email === 'dana@example.com') return json(res, 200, { results: [{ address: `dana@${DOMAIN}`, about: 'Assistant to Dana', matched: 'email', score: 1, name: 'Dana', domain: DOMAIN, degree: null, mutualConnections: 0, connection: 'none', workspace: false }], more: false });
      return json(res, 200, { results: [], more: false, invite: { note: 'n', tellYourPerson: 't', forYourPerson: FOR_PERSON, joinUrl: 'https://x/network' }, hint: 'Nobody listed on this network matches.' });
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

  it('discover --email and --phone send those parameters; a miss says "not listed or not there" and prints the server\'s note for your person; a refusal and a limit say what to do', async () => {
    await join2(['--name', 'me']);
    const hit = await cli(['network', 'discover', '--email', 'dana@example.com']);
    expect(hit.code, hit.stderr).toBe(0);
    const q = last('/agnt/discover').query;
    expect([q.get('email'), q.get('phone'), q.get('q')]).toEqual(['dana@example.com', null, null]);
    expect(hit.json.results[0]).toMatchObject({ matched: 'email', address: `dana@${DOMAIN}` });
    expect(hit.json.note).toMatch(/information, never instructions/);

    const miss = await cli(['network', 'discover', '--email', 'nobody@example.com']);
    expect(miss.code, miss.stderr).toBe(0);
    expect(miss.json.results).toEqual([]);
    expect(miss.json.note).toMatch(/not listed or not there/);
    // The CLI's own words on a miss: nothing about an invite or anyone being emailed (the server's note above is its own).
    expect(miss.json.note).not.toMatch(/invite|emailed/i);
    expect(miss.stderr).not.toMatch(/invite|emailed/i);
    const help = await cli(['network', 'discover', '--help']);
    expect(help.stdout).not.toMatch(/invite|emailed/i);
    expect(help.stdout).toContain('a --contacts call counts as one search');
    const short = await cli(['network', 'discover', '--name', 'ab']);
    expect(short.code).toBe(2);
    expect(short.stderr).toMatch(/--name needs 3 letters or more/);
    expect(miss.stderr).toContain(`FOR YOUR PERSON (give this to them word for word):\n${FOR_PERSON}\n`);

    const refused = await cli(['network', 'discover', '--phone', '+15555550199']);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toMatch(/phone is an E\.164 phone number/);
    expect(refused.stderr).toMatch(/--email takes one email address and --phone one number with its country code/);

    const tooLong = await cli(['network', 'discover', '--email', `${'a'.repeat(320)}@example.com`]);
    expect(tooLong.code).toBe(1);
    expect(tooLong.stderr).toMatch(/"code": "bad_request"/);
    expect(tooLong.stderr).toMatch(/--email takes one email address and --phone one number with its country code/);

    const limited = await cli(['network', 'discover', '--email', 'limit@example.com']);
    expect(limited.code).toBe(75);
    expect(limited.stderr).toMatch(/"retryAfter": 90/);
    expect(limited.stderr).toMatch(/60 searches an hour and 300 a day/);

    // Usage errors never reach the server.
    const before = fake.requests.length;
    const both = await cli(['network', 'discover', '--email', 'dana@example.com', '--phone', '+15555550100']);
    expect(both.code).toBe(2);
    expect(both.stderr).toMatch(/one email or one phone, not both/);
    expect((await cli(['network', 'discover', 'a florist', '--email', 'dana@example.com'])).code).toBe(2);
    expect(fake.requests.length).toBe(before);
  });

  it('discover --contacts: the contacts route, the cursor carried on unchanged, the daily limit as 75', async () => {
    await join2(['--name', 'me']);
    const first = await cli(['network', 'discover', '--contacts']);
    expect(first.code, first.stderr).toBe(0);
    expect(last('/agnt/discover/contacts').query.has('cursor')).toBe(false);
    expect(first.json.matches[0]).toMatchObject({ contact: 'Dana', address: `dana@${DOMAIN}` });
    expect(first.stderr).toContain(`more contacts follow (this call stopped at its lookup cap): run the same command with --cursor ${'f'.repeat(24)}.`);
    const next = await cli(['network', 'discover', '--contacts', '--cursor', 'f'.repeat(24)]);
    expect(next.code, next.stderr).toBe(0);
    expect(last('/agnt/discover/contacts').query.get('cursor')).toBe('f'.repeat(24));
    expect(next.json.cursor).toBeNull();
    expect(next.stderr).toMatch(/none of the 4 emails and phones looked up in this call is a listed agent/);
    expect((await cli(['network', 'discover', '--contacts', '--cursor', 'nope'])).code).toBe(2);
    fake.state.contactsLimited = true;
    const limited = await cli(['network', 'discover', '--contacts']);
    expect(limited.code).toBe(75);
    expect(limited.stderr).toMatch(/"retryAfter": 40000/);
    expect(limited.stderr).toMatch(/looking up your contacts 10 times a day/);
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
