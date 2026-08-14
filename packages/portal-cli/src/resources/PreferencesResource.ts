import type { HttpClient } from '../HttpClient.js';
import type {
  SkillPreferences, SchedulingPreferences, RemindersPreferences, FollowupsPreferences,
  SupervisionPreferences, SupervisionMatrixSnapshot, RecipientException, CreateRecipientExceptionBody,
  NotificationPreferences, PreferredProviders,
} from '../types.js';

/**
 * User + per-identifier preferences: skill prefs (reminders/followups/
 * supervision/scheduling), the supervision approval matrix + its recipient
 * exceptions, notification prefs, preferred providers, and user-level
 * (cross-identifier) reminder prefs. Every /users/:userId/preferences/* call
 * is server-enforced to `auth.userId === userId` — a personal API key can
 * only ever read/write its own user's preferences.
 */
export class PreferencesResource {
  constructor(private http: HttpClient) {}

  // ── Per-identifier skill preferences ────────────────────────────────────

  async getAll(identifierId: string): Promise<unknown> {
    const r = await this.http.get<any>(`/identifiers/${identifierId}/preferences`);
    return r.preferences;
  }

  async getSkill<T = unknown>(identifierId: string, skillName: string): Promise<SkillPreferences<T>> {
    const r = await this.http.get<any>(`/identifiers/${identifierId}/preferences/${skillName}`);
    return r.skillPreferences;
  }

  async setSkill<T = unknown>(identifierId: string, skillName: string, preferences: T): Promise<SkillPreferences<T>> {
    const r = await this.http.put<any>(`/identifiers/${identifierId}/preferences/${skillName}`, { preferences });
    return r.skillPreferences;
  }

  async getIdentifierReminders(identifierId: string): Promise<RemindersPreferences> {
    return (await this.getSkill<RemindersPreferences>(identifierId, 'reminders')).preferences;
  }

  async updateIdentifierReminders(identifierId: string, preferences: RemindersPreferences): Promise<RemindersPreferences> {
    return (await this.setSkill<RemindersPreferences>(identifierId, 'reminders', preferences)).preferences;
  }

  async getIdentifierFollowups(identifierId: string): Promise<FollowupsPreferences> {
    return (await this.getSkill<FollowupsPreferences>(identifierId, 'followups')).preferences;
  }

  async updateIdentifierFollowups(identifierId: string, preferences: FollowupsPreferences): Promise<FollowupsPreferences> {
    return (await this.setSkill<FollowupsPreferences>(identifierId, 'followups', preferences)).preferences;
  }

  async getIdentifierSupervision(identifierId: string): Promise<SupervisionPreferences> {
    return (await this.getSkill<SupervisionPreferences>(identifierId, 'supervision')).preferences;
  }

  async updateIdentifierSupervision(identifierId: string, preferences: SupervisionPreferences): Promise<SupervisionPreferences> {
    return (await this.setSkill<SupervisionPreferences>(identifierId, 'supervision', preferences)).preferences;
  }

  async getIdentifierScheduling(identifierId: string): Promise<SchedulingPreferences> {
    return (await this.getSkill<SchedulingPreferences>(identifierId, 'scheduling')).preferences;
  }

  async updateIdentifierScheduling(identifierId: string, preferences: SchedulingPreferences): Promise<SchedulingPreferences> {
    return (await this.setSkill<SchedulingPreferences>(identifierId, 'scheduling', preferences)).preferences;
  }

  // ── User-level scheduling (primary identifier) ──────────────────────────

  async getUserScheduling(userId: string): Promise<SchedulingPreferences> {
    const r = await this.http.get<any>(`/users/${userId}/preferences/scheduling`);
    return r.schedulingPreferences;
  }

  async updateUserScheduling(userId: string, schedulingPreferences: SchedulingPreferences): Promise<SchedulingPreferences> {
    const r = await this.http.put<any>(`/users/${userId}/preferences/scheduling`, { schedulingPreferences });
    return r.schedulingPreferences;
  }

  // ── Supervision approval matrix ──────────────────────────────────────────

  async getSupervisionMatrix(userId: string): Promise<SupervisionMatrixSnapshot> {
    const r = await this.http.get<any>(`/users/${userId}/preferences/supervision/matrix`);
    return r.supervisionMatrix;
  }

  /** Deep-merges `matrix` into the stored matrix. `matrix.locked` is admin-scope only — sending it 400s. */
  async updateSupervisionMatrix(userId: string, matrix: Record<string, unknown>): Promise<SupervisionMatrixSnapshot> {
    const r = await this.http.patch<any>(`/users/${userId}/preferences/supervision/matrix`, { matrix });
    return r.supervisionMatrix;
  }

  async resetSupervisionMatrix(userId: string): Promise<SupervisionMatrixSnapshot> {
    const r = await this.http.put<any>(`/users/${userId}/preferences/supervision/matrix/reset`, undefined);
    return r.supervisionMatrix;
  }

  async addRecipientException(userId: string, body: CreateRecipientExceptionBody): Promise<RecipientException> {
    const r = await this.http.post<any>(`/users/${userId}/preferences/supervision/exceptions`, body);
    return r.recipientException;
  }

  /** 204 No Content on success. */
  async removeRecipientException(userId: string, exceptionId: string): Promise<void> {
    await this.http.delete(`/users/${userId}/preferences/supervision/exceptions/${exceptionId}`);
  }

  // ── Notification preferences ─────────────────────────────────────────────

  async getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
    const r = await this.http.get<any>(`/users/${userId}/preferences/notifications`);
    return r.notificationPreferences;
  }

  async updateNotificationPreferences(userId: string, body: Record<string, unknown>): Promise<NotificationPreferences> {
    const r = await this.http.patch<any>(`/users/${userId}/preferences/notifications`, body);
    return r.notificationPreferences;
  }

  // ── Preferred providers ──────────────────────────────────────────────────

  async getPreferredProviders(userId: string): Promise<PreferredProviders> {
    const r = await this.http.get<any>(`/users/${userId}/preferences/preferred-providers`);
    return r.preferredProviders;
  }

  async updatePreferredProviders(userId: string, body: Record<string, unknown>): Promise<PreferredProviders> {
    const r = await this.http.patch<any>(`/users/${userId}/preferences/preferred-providers`, body);
    return r.preferredProviders;
  }

  // ── User-level (cross-identifier) reminder preferences ──────────────────

  async getUserReminderPreferences(userId: string): Promise<RemindersPreferences> {
    const r = await this.http.get<any>(`/users/${userId}/preferences/reminders`);
    return r.reminderPreferences ?? {};
  }

  async updateUserReminderPreferences(userId: string, preferences: Partial<RemindersPreferences>): Promise<RemindersPreferences> {
    const r = await this.http.patch<any>(`/users/${userId}/preferences/reminders`, { preferences });
    return r.reminderPreferences;
  }
}
