import type { HttpClient } from '../HttpClient.js';
import type { Roster, RosterAssistant, CreateAssistantBody, User } from '../types.js';

/**
 * Multiple-assistants-per-user roster. The singular `/users/:userId/assistant`
 * surface (see AssistantsResource) still operates on the primary only — this
 * is the plural collection + hire/release lifecycle.
 */
export class RosterResource {
  constructor(private http: HttpClient) {}

  async list(userId: string): Promise<Roster> {
    const r = await this.http.get<any>(`/users/${userId}/assistants`);
    return { assistants: r.assistants ?? [], primaryAssistantId: r.primaryAssistantId ?? null };
  }

  /** Creates a user-scoped assistant and hires it in one call — idempotent on (user, name). First hire also becomes primary. */
  async createAndHire(userId: string, body: CreateAssistantBody): Promise<RosterAssistant> {
    const r = await this.http.post<any>(`/users/${userId}/assistants`, body);
    return r.assistant;
  }

  /** Hires an already-visible (e.g. team/org-shared) assistant onto the user's roster. Returns the updated User. */
  async hireExisting(userId: string, assistantId: string): Promise<User> {
    const r = await this.http.post<any>(`/users/${userId}/assistants/${assistantId}/hire`, undefined);
    return r.user;
  }

  /** Any assistant visible to the user is a valid target — no prior hire required, it hires as part of the flip. */
  async setPrimary(userId: string, assistantId: string): Promise<User> {
    const r = await this.http.post<any>(`/users/${userId}/assistants/${assistantId}/primary`, undefined);
    return r.user;
  }

  /** 409 has_pending_work if the assistant still owns in-flight tasks — pass transferPendingWork to move them to the primary first. */
  async release(userId: string, assistantId: string, opts: { transferPendingWork?: boolean } = {}): Promise<User> {
    const query = opts.transferPendingWork ? { transfer: 'primary' } : undefined;
    const r = await this.http.delete<any>(`/users/${userId}/assistants/${assistantId}${query ? '?transfer=primary' : ''}`);
    return r.user;
  }
}
