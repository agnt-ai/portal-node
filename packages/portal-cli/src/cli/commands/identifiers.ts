import { clientFor } from '../utils/api.js';

export interface IdentifiersListOptions {
  profile?: string;
  json?: boolean;
}

export async function runIdentifiersList(opts: IdentifiersListOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const identifiers = await client.identifiers.list();

  if (opts.json) {
    console.log(JSON.stringify(identifiers, null, 2));
    return;
  }
  if (!identifiers.length) {
    console.log('No identifiers found.');
    return;
  }
  for (const identifier of identifiers) {
    const flags = [identifier.verified ? 'verified' : 'unverified', identifier.primary ? 'primary' : null].filter(Boolean).join(', ');
    console.log(`${identifier.id}  ${identifier.type}  ${identifier.value}  [${flags}]`);
  }
}

export interface IdentifiersMakePrimaryOptions {
  profile?: string;
}

export async function runIdentifiersMakePrimary(identifierId: string, opts: IdentifiersMakePrimaryOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.identifiers.makePrimary(identifierId);
  console.log(`Set ${identifierId} as primary.`);
}

export interface IdentifiersDeleteOptions {
  profile?: string;
}

export async function runIdentifiersDelete(identifierId: string, opts: IdentifiersDeleteOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.identifiers.delete(identifierId);
  console.log(`Deleted identifier ${identifierId}.`);
}
