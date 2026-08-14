import { clientFor } from '../utils/api.js';

export interface SkillStoreBrowseOptions {
  tier?: 'agnt' | 'official' | 'community';
  kind?: string;
  search?: string;
  page?: string;
  limit?: string;
  profile?: string;
  json?: boolean;
}

export async function runSkillStoreBrowse(opts: SkillStoreBrowseOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.skillStore.browse({
    tier: opts.tier, kind: opts.kind, search: opts.search,
    page: opts.page ? parseInt(opts.page, 10) : undefined,
    limit: opts.limit ? parseInt(opts.limit, 10) : undefined,
  });

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!result.skills.length) {
    console.log('No skills found.');
    return;
  }
  for (const skill of result.skills) {
    console.log(`${skill.accountSlug}/${skill.slug}  ${skill.displayName}  [${skill.tier}]  ${skill.accessStatus}`);
  }
}

export async function runSkillStoreGet(accountSlug: string, skillSlug: string, opts: { profile?: string }): Promise<void> {
  const client = await clientFor(opts.profile);
  const skill = await client.skillStore.get(accountSlug, skillSlug);
  console.log(JSON.stringify(skill, null, 2));
}

export async function runSkillStoreInstall(accountSlug: string, skillSlug: string, opts: { profile?: string }): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.skillStore.install(accountSlug, skillSlug);
  console.log(`Installed ${accountSlug}/${skillSlug} (install ${(result as any).installId}).`);
}

export async function runSkillStoreUninstall(accountSlug: string, skillSlug: string, opts: { profile?: string }): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.skillStore.uninstall(accountSlug, skillSlug);
  console.log(`Uninstalled ${accountSlug}/${skillSlug}.`);
}

export interface SkillStoreRequestOptions {
  message?: string;
  profile?: string;
}

export async function runSkillStoreRequestAccess(accountSlug: string, skillSlug: string, opts: SkillStoreRequestOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.skillStore.requestAccess(accountSlug, skillSlug, opts.message);
  console.log(`Requested access to ${accountSlug}/${skillSlug} — status: ${result.status}.`);
}

export async function runSkillStorePermissions(opts: { profile?: string }): Promise<void> {
  const client = await clientFor(opts.profile);
  const permissions = await client.skillStore.getPermissions();
  console.log(JSON.stringify(permissions, null, 2));
}

export async function runSkillStoreMyAccess(opts: { profile?: string; json?: boolean }): Promise<void> {
  const client = await clientFor(opts.profile);
  const items = await client.skillStore.myAccess();

  if (opts.json) {
    console.log(JSON.stringify(items, null, 2));
    return;
  }
  if (!items.length) {
    console.log('No non-owned skill access.');
    return;
  }
  for (const item of items) {
    console.log(`${item.installId}  ${item.source}  [${item.status}]`);
  }
}

export async function runSkillStoreIncomingRequests(opts: { profile?: string; json?: boolean }): Promise<void> {
  const client = await clientFor(opts.profile);
  const requests = await client.skillStore.listIncomingRequests();

  if (opts.json) {
    console.log(JSON.stringify(requests, null, 2));
    return;
  }
  if (!requests.length) {
    console.log('No incoming requests.');
    return;
  }
  for (const req of requests) {
    console.log(`${req.installId}  ${req.requestedBy} → ${req.skillSlug}  [${req.status}]  ${req.message ?? ''}`);
  }
}

export async function runSkillStoreApproveRequest(installId: string, opts: { profile?: string }): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.skillStore.approveRequest(installId);
  console.log(`Approved request ${installId}.`);
}

export async function runSkillStoreDeclineRequest(installId: string, opts: { profile?: string }): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.skillStore.declineRequest(installId);
  console.log(`Declined request ${installId}.`);
}
