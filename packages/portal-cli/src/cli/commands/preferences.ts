import { clientFor } from '../utils/api.js';

function parseJsonBody(body: string, example: string): any {
  try {
    return JSON.parse(body);
  } catch {
    console.error(`Body must be valid JSON, e.g. '${example}'`);
    process.exit(1);
  }
}

export interface PreferencesOptions {
  profile?: string;
  json?: boolean;
}

export async function runPreferencesGetSkill(identifierId: string, skill: string, opts: PreferencesOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.preferences.getSkill(identifierId, skill);
  console.log(JSON.stringify(result, null, 2));
}

export async function runPreferencesSetSkill(identifierId: string, skill: string, body: string, opts: PreferencesOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const parsed = parseJsonBody(body, '{"level":"all"}');
  const result = await client.preferences.setSkill(identifierId, skill, parsed);
  console.log(JSON.stringify(result, null, 2));
}

export async function runPreferencesGetScheduling(userId: string, opts: PreferencesOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.preferences.getUserScheduling(userId);
  console.log(JSON.stringify(result, null, 2));
}

export async function runPreferencesUpdateScheduling(userId: string, body: string, opts: PreferencesOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const parsed = parseJsonBody(body, '{"bufferMin":15}');
  const result = await client.preferences.updateUserScheduling(userId, parsed);
  console.log(JSON.stringify(result, null, 2));
}

export async function runPreferencesGetMatrix(userId: string, opts: PreferencesOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.preferences.getSupervisionMatrix(userId);
  console.log(JSON.stringify(result, null, 2));
}

export async function runPreferencesUpdateMatrix(userId: string, body: string, opts: PreferencesOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const parsed = parseJsonBody(body, '{"sendEmail":{"mode":"auto"}}');
  const result = await client.preferences.updateSupervisionMatrix(userId, parsed);
  console.log(JSON.stringify(result, null, 2));
}

export async function runPreferencesResetMatrix(userId: string, opts: PreferencesOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.preferences.resetSupervisionMatrix(userId);
  console.log(JSON.stringify(result, null, 2));
}

export async function runPreferencesAddException(userId: string, body: string, opts: PreferencesOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const parsed = parseJsonBody(body, '{"match":{"kind":"contactId","value":"c_123"},"mode":"auto"}');
  const result = await client.preferences.addRecipientException(userId, parsed);
  console.log(JSON.stringify(result, null, 2));
}

export async function runPreferencesRemoveException(userId: string, exceptionId: string, opts: { profile?: string }): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.preferences.removeRecipientException(userId, exceptionId);
  console.log(`Removed exception ${exceptionId}.`);
}

export async function runPreferencesGetNotifications(userId: string, opts: PreferencesOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.preferences.getNotificationPreferences(userId);
  console.log(JSON.stringify(result, null, 2));
}

export async function runPreferencesUpdateNotifications(userId: string, body: string, opts: PreferencesOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const parsed = parseJsonBody(body, '{"email":true}');
  const result = await client.preferences.updateNotificationPreferences(userId, parsed);
  console.log(JSON.stringify(result, null, 2));
}

export async function runPreferencesGetProviders(userId: string, opts: PreferencesOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.preferences.getPreferredProviders(userId);
  console.log(JSON.stringify(result, null, 2));
}

export async function runPreferencesUpdateProviders(userId: string, body: string, opts: PreferencesOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const parsed = parseJsonBody(body, '{"calendar":"google"}');
  const result = await client.preferences.updatePreferredProviders(userId, parsed);
  console.log(JSON.stringify(result, null, 2));
}

export async function runPreferencesGetReminders(userId: string, opts: PreferencesOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.preferences.getUserReminderPreferences(userId);
  console.log(JSON.stringify(result, null, 2));
}

export async function runPreferencesUpdateReminders(userId: string, body: string, opts: PreferencesOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const parsed = parseJsonBody(body, '{"level":"all"}');
  const result = await client.preferences.updateUserReminderPreferences(userId, parsed);
  console.log(JSON.stringify(result, null, 2));
}
