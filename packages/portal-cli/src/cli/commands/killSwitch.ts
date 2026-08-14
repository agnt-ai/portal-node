import { clientFor } from '../utils/api.js';

export interface KillSwitchOptions {
  profile?: string;
  json?: boolean;
}

export async function runKillSwitchGet(opts: KillSwitchOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const snapshot = await client.killSwitch.get();
  console.log(JSON.stringify(snapshot, null, 2));
}

export interface KillSwitchActionOptions {
  reason?: string;
  profile?: string;
  json?: boolean;
}

export async function runKillSwitchFreeze(opts: KillSwitchActionOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const snapshot = await client.killSwitch.freeze(opts.reason);

  if (opts.json) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }
  console.log(`Account frozen — all agent activity stopped.`);
}

export async function runKillSwitchRelease(opts: KillSwitchActionOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const snapshot = await client.killSwitch.release(opts.reason);

  if (opts.json) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }
  console.log(`Account released — agent activity resumed.`);
}
