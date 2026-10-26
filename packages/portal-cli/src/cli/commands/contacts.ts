import { readFileSync } from 'node:fs';
import { clientFor } from '../utils/api.js';

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

export interface ContactsBulkImportOptions {
  profile?: string;
  json?: boolean;
}

/** Reads a JSON array of contacts from disk (each like `contacts create`'s body, with an email) and imports them. */
export async function runContactsBulkImport(file: string, opts: ContactsBulkImportOptions): Promise<void> {
  let contacts: unknown;
  try {
    contacts = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`Could not read ${file} as JSON: ${(err as Error).message}`);
    process.exit(1);
  }
  if (!Array.isArray(contacts) || contacts.length === 0 || contacts.length > 1000) {
    console.error(`${file} must hold a JSON array of 1 to 1000 contacts.`);
    process.exit(1);
  }
  const client = await clientFor(opts.profile);
  const result = await client.contacts.bulkImport(contacts as any[]);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Imported ${result.total} contacts: ${result.created} new, ${result.updated} updated, ${result.skipped} skipped.`);
  for (const e of result.errors ?? []) {
    console.log(e.index == null ? `  ${e.error}` : `  contact ${e.index + 1}: ${e.error}`);
  }
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
