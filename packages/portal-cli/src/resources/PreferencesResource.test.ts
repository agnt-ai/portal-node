import { describe, it, expect, vi } from 'vitest';
import { PreferencesResource } from './PreferencesResource.js';
import type { HttpClient } from '../HttpClient.js';

function fakeHttp(overrides: Partial<HttpClient> = {}): HttpClient {
  return { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(), ...overrides } as unknown as HttpClient;
}

describe('PreferencesResource', () => {
  it('getSkill()/setSkill() unwrap { skillPreferences: { skill, preferences } }', async () => {
    const http = fakeHttp({
      get: vi.fn().mockResolvedValue({ skillPreferences: { skill: 'reminders', preferences: { level: 'all' } } }),
      put: vi.fn().mockResolvedValue({ skillPreferences: { skill: 'reminders', preferences: { level: 'none' } } }),
    });
    const resource = new PreferencesResource(http);
    expect(await resource.getSkill('id1', 'reminders')).toEqual({ skill: 'reminders', preferences: { level: 'all' } });
    expect(await resource.setSkill('id1', 'reminders', { level: 'none' })).toEqual({ skill: 'reminders', preferences: { level: 'none' } });
    expect(http.get).toHaveBeenCalledWith('/identifiers/id1/preferences/reminders');
    expect(http.put).toHaveBeenCalledWith('/identifiers/id1/preferences/reminders', { preferences: { level: 'none' } });
  });

  it('getIdentifierReminders()/updateIdentifierReminders() are thin wrappers over getSkill/setSkill with skill="reminders"', async () => {
    const http = fakeHttp({
      get: vi.fn().mockResolvedValue({ skillPreferences: { skill: 'reminders', preferences: { level: 'all' } } }),
      put: vi.fn().mockResolvedValue({ skillPreferences: { skill: 'reminders', preferences: { level: 'all' } } }),
    });
    const resource = new PreferencesResource(http);
    expect(await resource.getIdentifierReminders('id1')).toEqual({ level: 'all' });
    await resource.updateIdentifierReminders('id1', { level: 'all' } as any);
    expect(http.put).toHaveBeenCalledWith('/identifiers/id1/preferences/reminders', { preferences: { level: 'all' } });
  });

  it('getUserScheduling()/updateUserScheduling() unwrap { schedulingPreferences }', async () => {
    const http = fakeHttp({
      get: vi.fn().mockResolvedValue({ schedulingPreferences: { bufferMin: 15 } }),
      put: vi.fn().mockResolvedValue({ schedulingPreferences: { bufferMin: 30 } }),
    });
    const resource = new PreferencesResource(http);
    expect(await resource.getUserScheduling('u1')).toEqual({ bufferMin: 15 });
    expect(await resource.updateUserScheduling('u1', { bufferMin: 30 } as any)).toEqual({ bufferMin: 30 });
    expect(http.put).toHaveBeenCalledWith('/users/u1/preferences/scheduling', { schedulingPreferences: { bufferMin: 30 } });
  });

  it('supervision matrix get/update/reset unwrap { supervisionMatrix }', async () => {
    const snapshot = { matrix: {}, matrixUpdatedAt: null, parentLockedCells: [], orgLockedCells: [], teamLockedCells: [], lockedValues: {} };
    const http = fakeHttp({
      get: vi.fn().mockResolvedValue({ supervisionMatrix: snapshot }),
      patch: vi.fn().mockResolvedValue({ supervisionMatrix: snapshot }),
      put: vi.fn().mockResolvedValue({ supervisionMatrix: snapshot }),
    });
    const resource = new PreferencesResource(http);
    expect(await resource.getSupervisionMatrix('u1')).toEqual(snapshot);
    await resource.updateSupervisionMatrix('u1', { sendEmail: { mode: 'auto' } });
    expect(http.patch).toHaveBeenCalledWith('/users/u1/preferences/supervision/matrix', { matrix: { sendEmail: { mode: 'auto' } } });
    await resource.resetSupervisionMatrix('u1');
    expect(http.put).toHaveBeenCalledWith('/users/u1/preferences/supervision/matrix/reset', undefined);
  });

  it('addRecipientException() posts to /supervision/exceptions and unwraps { recipientException }', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue({ recipientException: { id: 'ex1' } }) });
    const result = await new PreferencesResource(http).addRecipientException('u1', { match: { kind: 'contactId', value: 'c1' } } as any);
    expect(http.post).toHaveBeenCalledWith('/users/u1/preferences/supervision/exceptions', { match: { kind: 'contactId', value: 'c1' } });
    expect(result).toEqual({ id: 'ex1' });
  });

  it('removeRecipientException() DELETEs and returns void (204)', async () => {
    const http = fakeHttp({ delete: vi.fn().mockResolvedValue(undefined) });
    await new PreferencesResource(http).removeRecipientException('u1', 'ex1');
    expect(http.delete).toHaveBeenCalledWith('/users/u1/preferences/supervision/exceptions/ex1');
  });

  it('notification preferences get/update unwrap { notificationPreferences }', async () => {
    const http = fakeHttp({
      get: vi.fn().mockResolvedValue({ notificationPreferences: { email: true } }),
      patch: vi.fn().mockResolvedValue({ notificationPreferences: { email: false } }),
    });
    const resource = new PreferencesResource(http);
    expect(await resource.getNotificationPreferences('u1')).toEqual({ email: true });
    await resource.updateNotificationPreferences('u1', { email: false });
    expect(http.patch).toHaveBeenCalledWith('/users/u1/preferences/notifications', { email: false });
  });

  it('preferred providers get/update unwrap { preferredProviders }', async () => {
    const http = fakeHttp({
      get: vi.fn().mockResolvedValue({ preferredProviders: { calendar: 'google' } }),
      patch: vi.fn().mockResolvedValue({ preferredProviders: { calendar: 'microsoft' } }),
    });
    const resource = new PreferencesResource(http);
    expect(await resource.getPreferredProviders('u1')).toEqual({ calendar: 'google' });
    await resource.updatePreferredProviders('u1', { calendar: 'microsoft' });
    expect(http.patch).toHaveBeenCalledWith('/users/u1/preferences/preferred-providers', { calendar: 'microsoft' });
  });

  it('user-level reminder preferences get/update unwrap { reminderPreferences }', async () => {
    const http = fakeHttp({
      get: vi.fn().mockResolvedValue({ reminderPreferences: { level: 'all' } }),
      patch: vi.fn().mockResolvedValue({ reminderPreferences: { level: 'none' } }),
    });
    const resource = new PreferencesResource(http);
    expect(await resource.getUserReminderPreferences('u1')).toEqual({ level: 'all' });
    await resource.updateUserReminderPreferences('u1', { level: 'none' } as any);
    expect(http.patch).toHaveBeenCalledWith('/users/u1/preferences/reminders', { preferences: { level: 'none' } });
  });
});
