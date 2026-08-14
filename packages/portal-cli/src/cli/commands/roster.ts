import { clientFor } from '../utils/api.js';

export interface RosterListOptions {
  profile?: string;
  json?: boolean;
}

export async function runRosterList(userId: string, opts: RosterListOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const roster = await client.roster.list(userId);

  if (opts.json) {
    console.log(JSON.stringify(roster, null, 2));
    return;
  }
  if (!roster.assistants.length) {
    console.log('No assistants on this roster.');
    return;
  }
  for (const assistant of roster.assistants) {
    console.log(`${assistant.id}  ${(assistant as any).name}  ${assistant.isPrimary ? '(primary)' : ''}`);
  }
}

export interface RosterCreateOptions {
  profile?: string;
  json?: boolean;
}

export async function runRosterCreateAndHire(userId: string, body: string, opts: RosterCreateOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    console.error('Body must be valid JSON, e.g. \'{"name":"Ada"}\'');
    process.exit(1);
  }
  const assistant = await client.roster.createAndHire(userId, parsed);

  if (opts.json) {
    console.log(JSON.stringify(assistant, null, 2));
    return;
  }
  console.log(`Hired assistant ${assistant.id}${assistant.isPrimary ? ' (primary)' : ''}.`);
}

export interface RosterActionOptions {
  profile?: string;
  json?: boolean;
}

export async function runRosterHire(userId: string, assistantId: string, opts: RosterActionOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const user = await client.roster.hireExisting(userId, assistantId);

  if (opts.json) {
    console.log(JSON.stringify(user, null, 2));
    return;
  }
  console.log(`Hired assistant ${assistantId} onto ${userId}'s roster.`);
}

export async function runRosterSetPrimary(userId: string, assistantId: string, opts: RosterActionOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const user = await client.roster.setPrimary(userId, assistantId);

  if (opts.json) {
    console.log(JSON.stringify(user, null, 2));
    return;
  }
  console.log(`${assistantId} is now the primary assistant for ${userId}.`);
}

export interface RosterReleaseOptions {
  transferPendingWork?: boolean;
  profile?: string;
  json?: boolean;
}

export async function runRosterRelease(userId: string, assistantId: string, opts: RosterReleaseOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const user = await client.roster.release(userId, assistantId, { transferPendingWork: opts.transferPendingWork });

  if (opts.json) {
    console.log(JSON.stringify(user, null, 2));
    return;
  }
  console.log(`Released ${assistantId} from ${userId}'s roster.`);
}
