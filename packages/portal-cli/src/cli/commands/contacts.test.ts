import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { runContactsImportLinkedIn, runContactsBulkImport, parseBulkImportFile } from './contacts.js';
import { clientFor } from '../utils/api.js';
import { PortalClient } from '../../index.js';

vi.mock('../utils/api.js', () => ({
  clientFor: vi.fn()
}));

const CSV =
  'Notes:\n"When exporting your connection data, you may notice..."\n\n' +
  'First Name,Last Name,URL,Email Address,Company,Position,Connected On\n' +
  'Ada,Lovelace,https://www.linkedin.com/in/ada-example,ada@example.com,"Example, Inc.",Engineer,01 Jan 2026\n' +
  'Alan,Turing,https://www.linkedin.com/in/alan-example,,Example Labs,Researcher,02 Jan 2026\n';

const SUMMARY = { total: 2, created: 1, updated: 1, skipped: 0, withEmail: 1, errors: [] };

describe('runContactsImportLinkedIn', () => {
  let dir: string;
  let file: string;
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(clientFor).mockReset();
    dir = mkdtempSync(join(tmpdir(), 'linkedin-import-'));
    file = join(dir, 'Connections.csv');
    writeFileSync(file, CSV);
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    log.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  it('sends the file text unchanged; the backend does the parsing', async () => {
    const client = { contacts: { importLinkedIn: vi.fn().mockResolvedValue(SUMMARY) } };
    vi.mocked(clientFor).mockResolvedValue(client as any);

    await runContactsImportLinkedIn(file, { profile: 'work' });

    expect(clientFor).toHaveBeenCalledWith('work');
    expect(client.contacts.importLinkedIn).toHaveBeenCalledWith(CSV);
    expect(log).toHaveBeenCalledWith(
      'Imported 2 LinkedIn connections: 1 new, 1 updated, 0 skipped; 1 shared an email.'
    );
  });

  it('lists the per-row errors under the summary', async () => {
    const result = {
      ...SUMMARY, skipped: 1,
      errors: [{ index: 3, error: 'no name' }, { error: '1 matched contact(s) could not be updated' }]
    };
    vi.mocked(clientFor).mockResolvedValue({ contacts: { importLinkedIn: vi.fn().mockResolvedValue(result) } } as any);

    await runContactsImportLinkedIn(file, {});

    // 1-based for people; an error with no index (batch-level) never prints "row undefined".
    expect(log).toHaveBeenCalledWith('  connection 4: no name');
    expect(log).toHaveBeenCalledWith('  1 matched contact(s) could not be updated');
    expect(log.mock.calls.some((c) => String(c[0]).includes('undefined'))).toBe(false);
  });

  it('--json prints the raw result', async () => {
    vi.mocked(clientFor).mockResolvedValue({ contacts: { importLinkedIn: vi.fn().mockResolvedValue(SUMMARY) } } as any);

    await runContactsImportLinkedIn(file, { json: true });

    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(log.mock.calls[0][0] as string)).toEqual(SUMMARY);
  });

  it('exits 1 with a clear message when the file cannot be read, before calling the API', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as any);

    await expect(runContactsImportLinkedIn(join(dir, 'missing.csv'), {})).rejects.toThrow('exit 1');

    expect(err.mock.calls[0][0]).toMatch(/^Could not read .*missing\.csv: /);
    expect(clientFor).not.toHaveBeenCalled();
    err.mockRestore();
    exit.mockRestore();
  });
});

/**
 * A fake API for POST /contacts/bulk-import that answers as the API does today: a bearer key is required; `contacts`
 * must be a non-empty array of at most 1000 (else 400 with the API's own message); each row needs an email ("Email is
 * required", skipped); a row repeating an address earlier in the batch is skipped ("Duplicate email in batch"); a row
 * whose email is already on file updates that contact, any other creates one. Fields it doesn't use are ignored, as
 * the API ignores them. The answer is { ok: true, bulkImport: { success, total, created, updated, skipped, errors } },
 * each error with the row's 0-based `index`.
 */
function fakeContactsApi(existing: string[] = []) {
  const onFile = new Set(existing.map((e) => e.toLowerCase()));
  const requests: Array<{ method: string; path: string; auth?: string; body: any }> = [];
  const json = (res: any, status: number, body: unknown) => {
    res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body));
  };
  const server: Server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;
    requests.push({ method: req.method!, path: req.url!, auth: req.headers.authorization, body });
    if (req.method !== 'POST' || req.url !== '/contacts/bulk-import') return json(res, 404, { status: 404, error: 'Not found' });
    if (!/^Bearer \S+$/.test(req.headers.authorization ?? '')) return json(res, 401, { status: 401, error: 'Invalid authentication' });
    const rows = body?.contacts;
    if (!Array.isArray(rows) || rows.length === 0) return json(res, 400, { status: 400, error: 'contacts array is required and cannot be empty' });
    if (rows.length > 1000) return json(res, 400, { status: 400, error: 'Maximum 1000 contacts allowed per import' });
    const result = { total: rows.length, created: 0, updated: 0, skipped: 0, errors: [] as any[] };
    const batch = new Set<string>();
    rows.forEach((d: any, i: number) => {
      if (!d.email) { result.errors.push({ index: i, error: 'Email is required' }); result.skipped++; return; }
      const email = String(d.email).toLowerCase().trim();
      if (batch.has(email)) { result.errors.push({ index: i, email: d.email, error: 'Duplicate email in batch' }); result.skipped++; return; }
      batch.add(email);
      if (onFile.has(email)) result.updated++; else { onFile.add(email); result.created++; }
    });
    json(res, 200, { ok: true, bulkImport: { success: true, ...result } });
  });
  return { server, requests };
}

describe('parseBulkImportFile', () => {
  it('takes an array of 1 to 1000 objects, each with a valid email, and passes every other field as is', () => {
    const contacts = [
      { email: 'ada@example.com', name: 'Ada Lovelace', company: 'Example Co', tags: ['friend'], nickname: 'kept' },
      { email: ' alan.turing+work@example.co.uk ' },
    ];
    expect(parseBulkImportFile(JSON.stringify(contacts))).toEqual({ ok: true, contacts });
    const max = Array.from({ length: 1000 }, (_, i) => ({ email: `p${i}@example.com` }));
    expect(parseBulkImportFile(JSON.stringify(max))).toMatchObject({ ok: true });
  });

  it('refuses what the API would refuse, naming each problem with contacts numbered from 1', () => {
    const problems = (text: string) => (parseBulkImportFile(text) as { ok: false; problems: string[] }).problems;
    expect(problems('{not json')[0]).toMatch(/^not valid JSON \(/);
    expect(problems('{"email":"ada@example.com"}')).toEqual([expect.stringMatching(/^must be a JSON array of contacts/)]);
    expect(problems('[]')).toEqual(['the array is empty: give at least 1 contact']);
    expect(problems(JSON.stringify(Array.from({ length: 1001 }, (_, i) => ({ email: `p${i}@example.com` })))))
      .toEqual(['1001 contacts; at most 1000 per import, so split the file']);
    expect(problems(JSON.stringify([
      { email: 'ok@example.com' }, { name: 'No Email' }, { email: 'not-an-email' }, 'ada@example.com', null, { email: 42 }, { email: 'a@b' },
    ]))).toEqual([
      'contact 2: email is required',
      'contact 3: "not-an-email" is not a valid email',
      'contact 4: must be an object with an email',
      'contact 5: must be an object with an email',
      'contact 6: 42 is not a valid email',
      'contact 7: "a@b" is not a valid email',
    ]);
  });
});

describe('runContactsBulkImport, against the API as it answers today', () => {
  let dir: string;
  let api: ReturnType<typeof fakeContactsApi>;
  let log: ReturnType<typeof vi.spyOn>;
  let err: ReturnType<typeof vi.spyOn>;
  let exit: ReturnType<typeof vi.spyOn>;
  const write = (name: string, text: string) => { const f = join(dir, name); writeFileSync(f, text); return f; };

  async function serve(existing: string[] = []) {
    api = fakeContactsApi(existing);
    await new Promise<void>((resolve, reject) => { api.server.once('error', reject); api.server.listen(0, '127.0.0.1', resolve); });
    const address = api.server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a loopback port');
    vi.mocked(clientFor).mockResolvedValue(new PortalClient({ apiUrl: `http://127.0.0.1:${address.port}`, apiKey: 'test-key' }));
  }

  beforeEach(async () => {
    vi.mocked(clientFor).mockReset();
    dir = mkdtempSync(join(tmpdir(), 'bulk-import-'));
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
    err = vi.spyOn(console, 'error').mockImplementation(() => {});
    exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => { throw new Error(`exit ${code}`); }) as any);
    await serve(['grace@example.com']);
  });

  afterEach(async () => {
    log.mockRestore(); err.mockRestore(); exit.mockRestore();
    api.server.closeAllConnections();
    await new Promise<void>((resolve) => api.server.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  });

  it('posts { contacts } exactly as the file has them and prints the summary, numbering errors from 1', async () => {
    const contacts = [
      { email: 'ada@example.com', name: 'Ada Lovelace', company: 'Example Co' },
      { email: 'grace@example.com', title: 'Rear Admiral' },
      { email: 'ADA@example.com', name: 'Ada again' },
    ];
    await runContactsBulkImport(write('contacts.json', JSON.stringify(contacts)), { profile: 'work' });

    expect(clientFor).toHaveBeenCalledWith('work');
    expect(api.requests).toEqual([{ method: 'POST', path: '/contacts/bulk-import', auth: 'Bearer test-key', body: { contacts } }]);
    expect(log.mock.calls.map((c) => c[0])).toEqual([
      'Imported 3 contacts: 1 new, 1 updated, 1 skipped.',
      '  contact 3: Duplicate email in batch',
    ]);
  });

  it('--json prints the result the API gave, unwrapped from bulkImport', async () => {
    await runContactsBulkImport(write('contacts.json', JSON.stringify([{ email: 'ada@example.com' }])), { json: true });

    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(log.mock.calls[0][0] as string)).toEqual({ success: true, total: 1, created: 1, updated: 0, skipped: 0, errors: [] });
  });

  it('sends 1000 in one call', async () => {
    const contacts = Array.from({ length: 1000 }, (_, i) => ({ email: `p${i}@example.com` }));
    await runContactsBulkImport(write('contacts.json', JSON.stringify(contacts)), {});

    expect(api.requests).toHaveLength(1);
    expect(api.requests[0].body.contacts).toHaveLength(1000);
    expect(log).toHaveBeenCalledWith('Imported 1000 contacts: 1000 new, 0 updated, 0 skipped.');
  });

  it('refuses a bad file with exit 2 and what to fix, before any API call', async () => {
    const bad = [
      '{not json', '{"email":"ada@example.com"}', '[]',
      JSON.stringify(Array.from({ length: 1001 }, (_, i) => ({ email: `p${i}@example.com` }))),
      JSON.stringify([{ email: 'ada@example.com' }, { name: 'No Email' }]),
      JSON.stringify([{ email: 'not-an-email' }]),
    ];
    for (const text of bad) {
      err.mockClear();
      const file = write('bad.json', text);
      await expect(runContactsBulkImport(file, {})).rejects.toThrow('exit 2');
      expect(err.mock.calls[0][0]).toBe(`${file} was not imported, nothing was sent:`);
      expect(err.mock.calls.length).toBeGreaterThan(1);
    }
    await expect(runContactsBulkImport(join(dir, 'missing.json'), {})).rejects.toThrow('exit 2');
    expect(err.mock.calls.at(-1)![0]).toMatch(/^Could not read .*missing\.json: /);

    expect(clientFor).not.toHaveBeenCalled();
    expect(api.requests).toEqual([]);
  });

  it('lists the first 10 problems, then how many more', async () => {
    const file = write('bad.json', JSON.stringify(Array.from({ length: 13 }, () => ({ name: 'No Email' }))));
    await expect(runContactsBulkImport(file, {})).rejects.toThrow('exit 2');

    const lines = err.mock.calls.map((c) => c[0]);
    expect(lines).toHaveLength(12);
    expect(lines[1]).toBe('  contact 1: email is required');
    expect(lines[10]).toBe('  contact 10: email is required');
    expect(lines[11]).toBe('  and 3 more');
    expect(api.requests).toEqual([]);
  });
});
