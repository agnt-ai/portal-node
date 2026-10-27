import { readFileSync } from 'node:fs';
import { clientFor } from '../utils/api.js';
import type { BulkImportContact } from '../../types.js';

export interface ContactsListOptions {
  search?: string;
  tags?: string;
  status?: string;
  profile?: string;
  json?: boolean;
}

export async function runContactsList(opts: ContactsListOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.contacts.list({ search: opts.search, tags: opts.tags, status: opts.status });

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!result.contacts.length) {
    console.log('No contacts found.');
    return;
  }
  for (const contact of result.contacts) {
    const name = (contact as any).name ?? [(contact as any).firstName, (contact as any).lastName].filter(Boolean).join(' ');
    console.log(`${contact.id}  ${name}`);
  }
}

export interface ContactsGetOptions {
  profile?: string;
  json?: boolean;
}

export async function runContactsGet(contactId: string, opts: ContactsGetOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const contact = await client.contacts.get(contactId);
  console.log(JSON.stringify(contact, null, 2));
}

export interface ContactsCreateOptions {
  profile?: string;
  json?: boolean;
}

export async function runContactsCreate(body: string, opts: ContactsCreateOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    console.error('Contact body must be valid JSON, e.g. \'{"firstName":"Ada","email":"ada@example.com"}\'');
    process.exit(1);
  }
  const contact = await client.contacts.create(parsed);

  if (opts.json) {
    console.log(JSON.stringify(contact, null, 2));
    return;
  }
  console.log(`Created contact ${contact.id}.`);
}

export interface ContactsDeleteOptions {
  profile?: string;
}

export async function runContactsDelete(contactId: string, opts: ContactsDeleteOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.contacts.delete(contactId);
  console.log(`Deleted contact ${contactId}.`);
}

export interface ContactsActivityOptions {
  profile?: string;
  json?: boolean;
}

export async function runContactsActivity(contactId: string, opts: ContactsActivityOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const activity = await client.contacts.activity(contactId);
  console.log(JSON.stringify(activity, null, 2));
}

export interface ContactsImportLinkedInOptions {
  profile?: string;
  json?: boolean;
}

/** Reads LinkedIn's Connections.csv from disk and imports it; the backend parses it. */
export async function runContactsImportLinkedIn(file: string, opts: ContactsImportLinkedInOptions): Promise<void> {
  let csv: string;
  try {
    csv = readFileSync(file, 'utf8');
  } catch (err) {
    console.error(`Could not read ${file}: ${(err as Error).message}`);
    process.exit(1);
  }
  const client = await clientFor(opts.profile);
  const result = await client.contacts.importLinkedIn(csv);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(
    `Imported ${result.total} LinkedIn connections: ${result.created} new, ${result.updated} updated, ` +
    `${result.skipped} skipped; ${result.withEmail} shared an email.`
  );
  for (const e of result.errors ?? []) {
    // index is 0-based after the header; a batch-level error (no index) is printed as is.
    console.log(e.index == null ? `  ${e.error}` : `  connection ${e.index + 1}: ${e.error}`);
  }
}

/** The most contacts one `contacts bulk-import` call takes (the API refuses more). */
export const BULK_IMPORT_MAX = 1000;

// The address check the API's spec documents for `email` (format: email).
const EMAIL_RE = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9-]*\.)+[A-Z]{2,}$/i;

/** How many problems a refusal lists before it says "and N more". */
const SHOWN_PROBLEMS = 10;

/**
 * Checks a bulk-import file's text before anything is sent: JSON, an array of 1 to 1000 objects, each with a
 * valid `email`. Returns the contacts, or the problems (contacts numbered from 1). Other fields are passed as
 * they are: the API takes the fields `contacts create` documents and ignores any it doesn't know.
 */
export function parseBulkImportFile(text: string):
  { ok: true; contacts: BulkImportContact[] } | { ok: false; problems: string[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return { ok: false, problems: [`not valid JSON (${(err as Error).message})`] };
  }
  if (!Array.isArray(data)) return { ok: false, problems: ['must be a JSON array of contacts, like [{"email":"ada@example.com"}]'] };
  if (data.length === 0) return { ok: false, problems: ['the array is empty: give at least 1 contact'] };
  if (data.length > BULK_IMPORT_MAX) {
    return { ok: false, problems: [`${data.length} contacts; at most ${BULK_IMPORT_MAX} per import, so split the file`] };
  }
  const problems: string[] = [];
  data.forEach((entry, i) => {
    const n = i + 1;
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      problems.push(`contact ${n}: must be an object with an email`);
    } else if ((entry as any).email === undefined || (entry as any).email === null || (entry as any).email === '') {
      problems.push(`contact ${n}: email is required`);
    } else if (typeof (entry as any).email !== 'string' || !EMAIL_RE.test((entry as any).email.trim())) {
      problems.push(`contact ${n}: ${JSON.stringify((entry as any).email)} is not a valid email`);
    }
  });
  if (problems.length) return { ok: false, problems };
  return { ok: true, contacts: data as BulkImportContact[] };
}

export interface ContactsBulkImportOptions {
  profile?: string;
  json?: boolean;
}

/**
 * Reads a JSON array of contacts from disk and imports them in one call. A file that fails
 * parseBulkImportFile is refused with exit 2 before any API call.
 */
export async function runContactsBulkImport(file: string, opts: ContactsBulkImportOptions): Promise<void> {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    console.error(`Could not read ${file}: ${(err as Error).message}`);
    process.exit(2);
  }
  const parsed = parseBulkImportFile(text);
  if (!parsed.ok) {
    console.error(`${file} was not imported, nothing was sent:`);
    for (const p of parsed.problems.slice(0, SHOWN_PROBLEMS)) console.error(`  ${p}`);
    if (parsed.problems.length > SHOWN_PROBLEMS) console.error(`  and ${parsed.problems.length - SHOWN_PROBLEMS} more`);
    process.exit(2);
  }
  const client = await clientFor(opts.profile);
  const result = await client.contacts.bulkImport(parsed.contacts);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Processed ${result.total} contacts: ${result.created} new, ${result.updated} updated, ${result.skipped} skipped.`);
  for (const e of result.errors ?? []) {
    // index is the contact's 0-based position in the file; an error with no index is printed as is.
    console.log(e.index == null ? `  ${e.error}` : `  contact ${e.index + 1}: ${e.error}`);
  }
}
