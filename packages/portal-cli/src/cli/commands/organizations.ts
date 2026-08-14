import { clientFor } from '../utils/api.js';

export interface OrgsListOptions {
  profile?: string;
  json?: boolean;
}

export async function runOrgsList(opts: OrgsListOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.organizations.list();

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!result.organizations.length) {
    console.log('No organizations found.');
    return;
  }
  for (const org of result.organizations) {
    console.log(`${org.id}  ${org.name}`);
  }
}

export interface OrgsGetOptions {
  profile?: string;
  json?: boolean;
}

export async function runOrgsGet(orgId: string, opts: OrgsGetOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const org = await client.organizations.get(orgId);
  console.log(JSON.stringify(org, null, 2));
}

export interface OrgsCreateOptions {
  profile?: string;
  json?: boolean;
}

export async function runOrgsCreate(name: string, opts: OrgsCreateOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const org = await client.organizations.create(name);

  if (opts.json) {
    console.log(JSON.stringify(org, null, 2));
    return;
  }
  console.log(`Created organization ${org.id}: ${org.name}`);
}

export interface OrgsDeleteOptions {
  profile?: string;
}

export async function runOrgsDelete(orgId: string, opts: OrgsDeleteOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.organizations.delete(orgId);
  console.log(`Deleted organization ${orgId}.`);
}
