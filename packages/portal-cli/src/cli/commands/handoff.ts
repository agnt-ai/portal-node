import { clientFor } from '../utils/api.js';

export interface HandoffOptions {
  profile?: string;
  json?: boolean;
}

export async function runHandoffList(opts: HandoffOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const handoffs = await client.handoff.listActive();

  if (opts.json) {
    console.log(JSON.stringify(handoffs, null, 2));
    return;
  }
  if (!handoffs.length) {
    console.log('No active handoffs.');
    return;
  }
  for (const h of handoffs) {
    console.log(`${h.id}  ${h.actionType}  [${h.status}]  ${h.prompt ?? ''}`);
  }
}

export async function runHandoffResolve(items: string, opts: HandoffOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  let parsed: any;
  try {
    parsed = JSON.parse(items);
  } catch {
    console.error('items must be valid JSON, e.g. \'[{"handoffId":"h_123","outcome":"completed"}]\'');
    process.exit(1);
  }
  await client.handoff.resolve(parsed);
  console.log(`Resolved ${parsed.length} handoff(s).`);
}

export async function runHandoffStartSession(handoffId: string, opts: { profile?: string }): Promise<void> {
  const client = await clientFor(opts.profile);
  const sessionUrl = await client.handoff.startSession(handoffId);
  console.log(sessionUrl);
}

export async function runHandoffComplete(handoffId: string, opts: { profile?: string }): Promise<void> {
  const client = await clientFor(opts.profile);
  const taskId = await client.handoff.complete(handoffId);
  console.log(taskId ? `Completed handoff ${handoffId} (task ${taskId}).` : `Completed handoff ${handoffId}.`);
}

export interface HandoffDeferOptions {
  minutes?: string;
  profile?: string;
}

export async function runHandoffDefer(handoffId: string, message: string, opts: HandoffDeferOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.handoff.defer(handoffId, message, opts.minutes ? parseInt(opts.minutes, 10) : undefined);
  console.log(`Deferred handoff ${handoffId}.`);
}

export async function runHandoffDecline(handoffId: string, opts: { profile?: string }): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.handoff.decline(handoffId);
  console.log(`Declined handoff ${handoffId}.`);
}

export async function runHandoffLaunch(opts: HandoffOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.handoff.launchBrowser();

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Launched handoff ${result.handoffId} (${result.status}). Poll "handoff list" until ready, then "handoff start-session ${result.handoffId}".`);
}
