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
