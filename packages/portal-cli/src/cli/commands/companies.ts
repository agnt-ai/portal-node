import { clientFor } from '../utils/api.js';

export interface CompaniesListOptions {
  search?: string;
  domain?: string;
  tags?: string;
  profile?: string;
  json?: boolean;
}

export async function runCompaniesList(opts: CompaniesListOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.companies.list({ search: opts.search, domain: opts.domain, tags: opts.tags });

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!result.companies.length) {
    console.log('No companies found.');
    return;
  }
  for (const company of result.companies) {
    console.log(`${company.id}  ${(company as any).name ?? ''}  ${(company as any).domain ?? ''}`);
  }
}

export interface CompaniesSearchOptions {
  limit?: string;
  profile?: string;
  json?: boolean;
}

export async function runCompaniesSearch(query: string, opts: CompaniesSearchOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const companies = await client.companies.search(query, opts.limit ? parseInt(opts.limit, 10) : undefined);

  if (opts.json) {
    console.log(JSON.stringify(companies, null, 2));
    return;
  }
  if (!companies.length) {
    console.log('No companies found.');
    return;
  }
  for (const company of companies) {
    console.log(`${company.id}  ${(company as any).name ?? ''}  ${(company as any).domain ?? ''}`);
  }
}

export interface CompaniesGetOptions {
  profile?: string;
}

export async function runCompaniesGet(companyId: string, opts: CompaniesGetOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const company = await client.companies.get(companyId);
  console.log(JSON.stringify(company, null, 2));
}

export interface CompaniesCreateOptions {
  profile?: string;
  json?: boolean;
}

function parseJsonBody(body: string, example: string): any {
  try {
    return JSON.parse(body);
  } catch {
    console.error(`Body must be valid JSON, e.g. '${example}'`);
    process.exit(1);
  }
}

export async function runCompaniesCreate(body: string, opts: CompaniesCreateOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const parsed = parseJsonBody(body, '{"name":"Acme Inc","domain":"acme.com"}');
  const company = await client.companies.create(parsed);

  if (opts.json) {
    console.log(JSON.stringify(company, null, 2));
    return;
  }
  console.log(`Created company ${company.id}.`);
}

export async function runCompaniesFindOrCreate(body: string, opts: CompaniesCreateOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const parsed = parseJsonBody(body, '{"domain":"acme.com"}');
  const company = await client.companies.findOrCreate(parsed);

  if (opts.json) {
    console.log(JSON.stringify(company, null, 2));
    return;
  }
  console.log(`${company.created ? 'Created' : 'Found existing'} company ${company.id}.`);
}

export interface CompaniesUpdateOptions {
  profile?: string;
  json?: boolean;
}

export async function runCompaniesUpdate(companyId: string, body: string, opts: CompaniesUpdateOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const parsed = parseJsonBody(body, '{"industry":"Software"}');
  const company = await client.companies.update(companyId, parsed);

  if (opts.json) {
    console.log(JSON.stringify(company, null, 2));
    return;
  }
  console.log(`Updated company ${company.id}.`);
}

export interface CompaniesDeleteOptions {
  profile?: string;
}

export async function runCompaniesDelete(companyId: string, opts: CompaniesDeleteOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.companies.delete(companyId);
  console.log(`Deleted company ${companyId}.`);
}

export interface CompaniesContactsOptions {
  profile?: string;
  json?: boolean;
}

export async function runCompaniesContacts(companyId: string, opts: CompaniesContactsOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const contacts = await client.companies.listContacts(companyId);

  if (opts.json) {
    console.log(JSON.stringify(contacts, null, 2));
    return;
  }
  if (!contacts.length) {
    console.log('No contacts at this company.');
    return;
  }
  for (const contact of contacts) {
    const name = (contact as any).name ?? [(contact as any).firstName, (contact as any).lastName].filter(Boolean).join(' ');
    console.log(`${contact.id}  ${name}`);
  }
}
