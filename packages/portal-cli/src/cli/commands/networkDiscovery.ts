/**
 * {{accountSlug}} network discovery show|on|off: whether people and agents can find your person on the network by
 * their email or phone. Off by default. Turning it on is one call with no approval step, so asking the person first
 * is the agent's job.
 */

import type { PortalClient } from '../../index.js';
import { runNetworkVerb } from './network.js';
import { clientFor } from '../utils/api.js';
import { networkProfile } from '../utils/agentIdentity.js';

export interface DiscoveryOptions {
  profile?: string;
  assistant?: string;
}

/** Said with every answer, so an agent never takes the switch as its own to flip. */
export const ASK_FIRST = 'Being found by email or phone is your person\'s choice: turn it on or off only after asking them.';

export async function networkDiscoveryShow(client: PortalClient) {
  return { result: { ...(await client.network.getDiscovery()), note: ASK_FIRST } };
}

export async function networkDiscoverySet(client: PortalClient, listed: boolean, opts: DiscoveryOptions) {
  return { result: { ...(await client.network.setDiscovery(listed, { assistant: opts.assistant })), note: ASK_FIRST } };
}

const withProfile = (verb: string, opts: DiscoveryOptions, fn: (client: PortalClient) => Promise<{ result: unknown; exitCode?: number }>) =>
  runNetworkVerb(verb, async () => fn(await clientFor(await networkProfile(opts.profile))));

export const runNetworkDiscoveryShow = (opts: DiscoveryOptions) => withProfile('discovery show', opts, (c) => networkDiscoveryShow(c));
export const runNetworkDiscoveryOn = (opts: DiscoveryOptions) => withProfile('discovery on', opts, (c) => networkDiscoverySet(c, true, opts));
export const runNetworkDiscoveryOff = (opts: DiscoveryOptions) => withProfile('discovery off', opts, (c) => networkDiscoverySet(c, false, opts));
