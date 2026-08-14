import type { HttpClient } from '../HttpClient.js';
import type { WorkspaceHandoff, HandoffResolution } from '../types.js';

/**
 * Workspace handoff ("JIT Auth") — an assistant hands control of a live
 * browser session to a human for something it can't do itself (login,
 * payment, MFA, form fill), or a human opens one proactively via
 * launchBrowser(). The CLI surfaces the data/decision layer (list, resolve,
 * defer, decline, complete) — the resulting `sessionUrl` is meant to be
 * opened in an actual browser by a human, not driven headlessly.
 */
export class HandoffResource {
  constructor(private http: HttpClient) {}

  /** Every outstanding handoff, oldest first. Falls back to the legacy singular `handoff` field. */
  async listActive(): Promise<WorkspaceHandoff[]> {
    const r = await this.http.get<any>('/workspace/handoff/active');
    if (Array.isArray(r.handoffs)) return r.handoffs;
    return r.handoff ? [r.handoff] : [];
  }

  /** The single most relevant outstanding handoff — newest. */
  async getActive(): Promise<WorkspaceHandoff | null> {
    const all = await this.listActive();
    return all.length ? all[all.length - 1] : null;
  }

  /** Hand control back for one or more handoffs in one call, reporting what got done. */
  async resolve(items: HandoffResolution[]): Promise<void> {
    await this.http.post('/workspace/handoff/resolve', { items });
  }

  /** Mints a session token/URL for a ready handoff — open in a browser to act on it. */
  async startSession(handoffId: string): Promise<string> {
    const r = await this.http.post<any>(`/workspace/handoff/${handoffId}/session`, undefined);
    return r.sessionUrl;
  }

  async complete(handoffId: string): Promise<string | null> {
    const r = await this.http.post<any>(`/workspace/handoff/${handoffId}/complete`, undefined);
    return r.taskId;
  }

  /** "Do It Later" — closes now, the assistant comes back later (own alarm, or `deferMinutes` if given). */
  async defer(handoffId: string, message: string, deferMinutes?: number): Promise<void> {
    await this.http.post(`/workspace/handoff/${handoffId}/defer`, deferMinutes ? { message, deferMinutes } : { message });
  }

  /** Terminal refusal — the backend won't mint another handoff for the same task after this. */
  async decline(handoffId: string): Promise<void> {
    await this.http.post(`/workspace/handoff/${handoffId}/decline`, undefined);
  }

  /**
   * User-initiated session with no agent request or task. Async: a cold
   * ECS/Fargate boot can take 60-90s, so this only creates the handoff
   * (status 'starting') — poll getActive() until status is 'ready', then
   * call startSession(handoffId) to mint the actual sessionUrl.
   */
  async launchBrowser(): Promise<{ handoffId: string; status: WorkspaceHandoff['status'] }> {
    const r = await this.http.post<any>('/workspace/handoff/launch', undefined);
    return { handoffId: r.handoffId, status: r.status };
  }
}
