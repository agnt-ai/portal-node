/**
 * {{accountSlug}} onboard — optional. Marks the account set up (POST /onboarding/mark-onboarded), and sets a
 * timezone or working hours only when given. Nothing needs it on a current server; an older one may still
 * answer 428 onboarding_required until it has run, and then it needs no input from anyone.
 *
 * Usage:
 *   {{accountSlug}} onboard
 *   {{accountSlug}} onboard --timezone "America/New_York"
 */

import { clientFor } from '../utils/api.js';

export interface OnboardOptions {
  timezone?: string;
  workingHours?: string;
  profile?: string;
  json?: boolean;
}

const WORKING_HOURS_EXAMPLE = '\'{"MO":[{"start":"09:00","end":"17:00"}],"TU":[{"start":"09:00","end":"17:00"}],"WE":[{"start":"09:00","end":"17:00"}],"TH":[{"start":"09:00","end":"17:00"}],"FR":[{"start":"09:00","end":"17:00"}]}\'';

export async function runOnboard(opts: OnboardOptions): Promise<void> {
  const timezone = opts.timezone?.trim() || undefined;

  let workingHours: Record<string, Array<{ start: string; end: string }>> | undefined;
  if (opts.workingHours) {
    try {
      workingHours = JSON.parse(opts.workingHours);
    } catch {
      console.error(`--working-hours must be valid JSON, e.g. ${WORKING_HOURS_EXAMPLE}`);
      process.exit(1);
    }
  }

  const client = await clientFor(opts.profile);
  if (timezone) await client.me.update({ timezone });
  if (workingHours) {
    const me = await client.me.get();
    await client.preferences.updateUserScheduling(me.id, { sync: true, availability: { sync: true, workingHours } });
  }
  await client.onboarding.markOnboarded();

  if (opts.json) {
    console.log(JSON.stringify({ ok: true, ...(timezone ? { timezone } : {}), ...(workingHours ? { workingHours } : {}) }, null, 2));
    return;
  }
  console.log(`Account setup is complete${timezone ? `, with timezone ${timezone}` : ''}.`);
}
