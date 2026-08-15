/**
 * {{accountSlug}} onboard — the smooth path through the server-side
 * onboarding gate (baseController.mjs blocks every apikey-authenticated
 * route except a small allowlist until timezone + working hours are set).
 * Sets both, then confirms completion — without this, an agent would have
 * to piece together three raw calls (PATCH /profile, PUT .../preferences/
 * scheduling, POST /onboarding/mark-onboarded) from the gate's error message
 * alone.
 *
 * Both flags are required on purpose, no default working hours — the whole
 * point of the gate is real values, not a guessed Mon-Fri 9-5 nobody asked
 * for.
 *
 * Usage:
 *   {{accountSlug}} onboard --timezone "America/New_York" \
 *     --working-hours '{"MO":[{"start":"09:00","end":"17:00"}],"TU":[{"start":"09:00","end":"17:00"}]}'
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
  const timezone = opts.timezone?.trim();
  if (!timezone) {
    console.error('--timezone is required, e.g. --timezone "America/New_York"');
    process.exit(1);
  }

  if (!opts.workingHours) {
    console.error('--working-hours is required — a day-keyed JSON object of {start,end} ranges, e.g.:');
    console.error(`  --working-hours ${WORKING_HOURS_EXAMPLE}`);
    console.error('Keys are MO/TU/WE/TH/FR/SA/SU; omit a day entirely if not working that day.');
    process.exit(1);
  }

  let workingHours: Record<string, Array<{ start: string; end: string }>>;
  try {
    workingHours = JSON.parse(opts.workingHours);
  } catch {
    console.error(`--working-hours must be valid JSON, e.g. ${WORKING_HOURS_EXAMPLE}`);
    process.exit(1);
  }

  const client = await clientFor(opts.profile);
  const me = await client.me.get();

  await client.me.update({ timezone });
  await client.preferences.updateUserScheduling(me.id, { sync: true, availability: { sync: true, workingHours } });
  await client.onboarding.markOnboarded();

  if (opts.json) {
    console.log(JSON.stringify({ ok: true, timezone, workingHours }, null, 2));
    return;
  }
  console.log(`Set timezone to ${timezone} and working hours. Account setup is complete — try: {{accountSlug}} tasks list`);
}
