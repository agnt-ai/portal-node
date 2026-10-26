import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runContactsImportLinkedIn } from './contacts.js';
import { clientFor } from '../utils/api.js';

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
