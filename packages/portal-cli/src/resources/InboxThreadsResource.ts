import type { HttpClient } from '../HttpClient.js';
import type { InboxEmail, InboxThreadsPage, ListInboxThreadsParams, UpdateInboxThreadResult } from '../types.js';

/** An assistant's connected-mailbox inbox — threads + the emails inside them. */
export class InboxThreadsResource {
  constructor(private http: HttpClient) {}

  async list(params?: ListInboxThreadsParams): Promise<InboxThreadsPage> {
    const r = await this.http.get<any>('/inbox/threads', params);
    return { threads: r.threads ?? [], total: r.total ?? 0, page: r.page ?? 1, perPage: r.perPage ?? 50 };
  }

  async listEmails(threadId: string): Promise<InboxEmail[]> {
    const r = await this.http.get<any>(`/inbox/threads/${threadId}/emails`);
    return r.emails ?? [];
  }

  /** Only `status` ('active' | 'archived') is currently writable. */
  async update(threadId: string, status: 'active' | 'archived'): Promise<UpdateInboxThreadResult> {
    return this.http.patch<UpdateInboxThreadResult>(`/inbox/threads/${threadId}`, { status });
  }

  /** Soft-deletes the thread and its emails. */
  async delete(threadId: string): Promise<{ ok: boolean; id: string }> {
    return this.http.delete<{ ok: boolean; id: string }>(`/inbox/threads/${threadId}`);
  }
}
