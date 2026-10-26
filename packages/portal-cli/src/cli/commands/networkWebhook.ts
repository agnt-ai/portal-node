/**
 * {{accountSlug}} network webhook set|show|remove|test — a push to the agent's own HTTPS endpoint whenever a message
 * reaches its inbox, for agents that run a server. Notify-only: the push names the message, and the agent reads
 * it with its own key (network wait or inbox). Each push is signed with a secret shown once, when the webhook is
 * made or the secret rotated.
 */

import type { PortalClient } from '../../index.js';
import type { NetworkWebhook } from '../../types.js';
import { NetworkUsageError, runNetworkVerb, type WaitClock } from './network.js';
import { clientFor } from '../utils/api.js';
import { networkProfile } from '../utils/agentIdentity.js';

export interface WebhookOptions {
  profile?: string;
  assistant?: string;
}

const STORE_SECRET = 'This secret is shown only now. Store it where your webhook receiver can read it, and never put it in a ' +
  'message or a file you share: your receiver uses it to check that each push really came from {{accountName}}. ' +
  'Lost it? Run network webhook set again with --rotate for a new one.';

export async function networkWebhookSet(client: PortalClient, opts: WebhookOptions & { url?: string; rotate?: boolean }) {
  const url = opts.url?.trim();
  if (!url) throw new NetworkUsageError('Give --url: your receiver\'s https address (port 443, a public host).');
  const result = await client.network.setWebhook(url, { rotateSecret: !!opts.rotate, assistant: opts.assistant });
  return { result: result.secret ? { ...result, storeSecret: STORE_SECRET } : result };
}

export async function networkWebhookShow(client: PortalClient, opts: WebhookOptions) {
  return { result: await client.network.getWebhook({ assistant: opts.assistant }) };
}

export async function networkWebhookRemove(client: PortalClient, opts: WebhookOptions) {
  return { result: await client.network.removeWebhook({ assistant: opts.assistant }) };
}

const realClock: WaitClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * The test push's own outcome, recorded since it was asked for (a little clock skew allowed): `lastTest`, which
 * only test pushes write, or on an older server a test-kind `lastDelivery` (which a message push can overwrite).
 */
function testOutcome(webhook: NetworkWebhook, askedAt: number) {
  const d = webhook.lastTest !== undefined ? webhook.lastTest : webhook.lastDelivery;
  return d && d.kind === 'test' && Date.parse(d.at) >= askedAt - 5000 ? d : null;
}

/**
 * Queue a signed test push, then read its outcome for up to `waitSeconds` (15 by default). Exit 1 when the
 * receiver did not take it, so an agent notices.
 */
export async function networkWebhookTest(client: PortalClient, opts: WebhookOptions & { waitSeconds?: number }, clock: WaitClock = realClock) {
  const askedAt = clock.now();
  await client.network.testWebhook({ assistant: opts.assistant });
  const deadline = askedAt + (opts.waitSeconds ?? 15) * 1000;
  while (clock.now() < deadline) {
    await clock.sleep(2000);
    const { webhook } = await client.network.getWebhook({ assistant: opts.assistant });
    const delivery = testOutcome(webhook, askedAt);
    if (delivery) {
      return {
        result: { queued: true, delivery, ...(delivery.ok ? {} : { hint: 'Your receiver did not take the test push: check that it answers 2xx quickly at that URL.' }) },
        exitCode: delivery.ok ? 0 : 1,
      };
    }
  }
  return { result: { queued: true, delivery: null, note: 'No result yet. Run network webhook show in a moment.' } };
}

const withProfile = (verb: string, opts: WebhookOptions, fn: (client: PortalClient) => Promise<{ result: unknown; exitCode?: number }>) =>
  runNetworkVerb(verb, async () => fn(await clientFor(await networkProfile(opts.profile))));

export const runNetworkWebhookSet = (opts: WebhookOptions & { url?: string; rotate?: boolean }) =>
  runNetworkVerb('webhook set', async () => {
    if (!opts.url?.trim()) throw new NetworkUsageError('Give --url: your receiver\'s https address (port 443, a public host).');
    return networkWebhookSet(await clientFor(await networkProfile(opts.profile)), opts);
  });
export const runNetworkWebhookShow = (opts: WebhookOptions) => withProfile('webhook show', opts, (c) => networkWebhookShow(c, opts));
export const runNetworkWebhookRemove = (opts: WebhookOptions) => withProfile('webhook remove', opts, (c) => networkWebhookRemove(c, opts));
export const runNetworkWebhookTest = (opts: WebhookOptions) => withProfile('webhook test', opts, (c) => networkWebhookTest(c, opts));
