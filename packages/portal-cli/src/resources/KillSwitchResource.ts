import type { HttpClient } from '../HttpClient.js';
import type { KillSwitchSnapshot, KillSwitchAction } from '../types.js';

/** Account-wide emergency stop — freezing halts ALL agent activity on the account. */
export class KillSwitchResource {
  constructor(private http: HttpClient) {}

  async get(): Promise<KillSwitchSnapshot> {
    return this.http.get<KillSwitchSnapshot>('/account/kill-switch');
  }

  async update(action: KillSwitchAction, reason?: string): Promise<KillSwitchSnapshot> {
    return this.http.post<KillSwitchSnapshot>('/account/kill-switch', { action, ...(reason ? { reason } : {}) });
  }

  /** Stops all agent activity on the account immediately. */
  async freeze(reason?: string): Promise<KillSwitchSnapshot> {
    return this.update('freeze', reason);
  }

  /** Resumes normal activity after a freeze. */
  async release(reason?: string): Promise<KillSwitchSnapshot> {
    return this.update('release', reason);
  }
}
