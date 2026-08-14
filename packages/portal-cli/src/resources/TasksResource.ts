import type { HttpClient } from '../HttpClient.js';
import type {
  Task, CreateTaskBody, UpdateTaskBody, ListTasksParams, TasksPage,
  TaskActivity, ApproveBatchResult
} from '../types.js';

/**
 * Tasks — full parity with agnt-backend's /tasks/* surface (cross-checked
 * against agnt-portal's own lib/api/tasks.ts and OpenAPI schema, not guessed).
 */
export class TasksResource {
  constructor(private http: HttpClient) {}

  async list(params?: ListTasksParams): Promise<TasksPage> {
    const query: Record<string, any> = { ...params };
    if (Array.isArray(params?.status)) query.status = params!.status.join(',');
    if (params?.mine) query.mine = 'true';
    const r = await this.http.get<any>('/tasks', query);
    return { tasks: r.tasks ?? [], total: r.total ?? 0, page: r.page ?? 1, perPage: r.perPage ?? 50 };
  }

  async create(body: CreateTaskBody): Promise<Task> {
    const r = await this.http.post<any>('/tasks', body);
    // The endpoint has returned either a bare Task or { task } historically —
    // agnt-portal's own wrapper handles both for the same reason.
    return r.task ?? r;
  }

  async get(taskId: string): Promise<Task> {
    const r = await this.http.get<any>(`/tasks/${taskId}`);
    return r.task;
  }

  async update(taskId: string, body: UpdateTaskBody): Promise<Task> {
    const r = await this.http.put<any>(`/tasks/${taskId}`, body);
    return r.task ?? r;
  }

  async delete(taskId: string): Promise<void> {
    await this.http.delete(`/tasks/${taskId}`);
  }

  async updateAssignees(taskId: string, emails: string[]): Promise<Task> {
    const r = await this.http.put<any>(`/tasks/${taskId}/assignees`, { emails });
    return r.task;
  }

  async feedback(taskId: string, status: 'like' | 'dislike' | null): Promise<void> {
    await this.http.post(`/tasks/${taskId}/feedback`, { status });
  }

  /** Kick off / resume a task, optionally sending it a message (with an empty body this also resumes a paused task). */
  async process(taskId: string, body?: { message?: string; files?: Array<{ name: string; fileId: string; mimeType?: string }> }): Promise<void> {
    await this.http.post(`/tasks/${taskId}/process`, body ?? {});
  }

  /** Convenience alias for process() with no message — resumes a paused/on-hold task. */
  async resume(taskId: string): Promise<void> {
    await this.process(taskId);
  }

  /** Convenience alias for process() with a message — the CLI/agent equivalent of replying in the task's chat. */
  async sendMessage(taskId: string, message: string, files?: Array<{ name: string; fileId: string; mimeType?: string }>): Promise<void> {
    await this.process(taskId, { message, ...(files?.length ? { files } : {}) });
  }

  async stop(taskId: string): Promise<void> {
    await this.http.post(`/tasks/${taskId}/stop`);
  }

  async interrupt(taskId: string): Promise<void> {
    await this.http.post(`/tasks/${taskId}/interrupt`);
  }

  async markSeen(taskId: string, lastSeenAt?: string): Promise<void> {
    await this.http.post(`/tasks/${taskId}/seen`, { lastSeenAt: lastSeenAt ?? new Date().toISOString() });
  }

  async markDone(taskId: string): Promise<void> {
    await this.http.post(`/tasks/${taskId}/mark-done`);
  }

  async archive(taskId: string): Promise<void> {
    await this.http.post(`/tasks/${taskId}/archive`);
  }

  async unarchive(taskId: string): Promise<void> {
    await this.http.post(`/tasks/${taskId}/unarchive`);
  }

  async seize(taskId: string): Promise<void> {
    await this.http.post(`/tasks/${taskId}/seize`);
  }

  /** Approve a task sitting behind an approval gate (approvalGate: 'pending_user_approval'). */
  async approve(taskId: string, reason?: string): Promise<Task> {
    const r = await this.http.post<any>(`/tasks/${taskId}/approve`, reason ? { reason } : {});
    return r.task;
  }

  async decline(taskId: string, reason?: string): Promise<Task> {
    const r = await this.http.post<any>(`/tasks/${taskId}/decline`, reason ? { reason } : {});
    return r.task;
  }

  async approveBatch(taskIds: string[]): Promise<ApproveBatchResult> {
    const r = await this.http.post<any>('/tasks/approve-batch', { taskIds });
    return r.batch;
  }

  /** Save this task's plan as a reusable workflow skill. */
  async saveAsWorkflow(taskId: string): Promise<{ id: string; name: string; title: string }> {
    const r = await this.http.post<any>(`/tasks/${taskId}/save-as-workflow`);
    return r.skill;
  }

  /** Paginates internally (100/page) and returns the full activity feed, oldest-first — same as agnt-portal's fetchAllTaskActivities. */
  async listActivities(taskId: string): Promise<TaskActivity[]> {
    const all: TaskActivity[] = [];
    let cursor: string | undefined;
    let hasMore = true;
    while (hasMore) {
      const query: Record<string, any> = { limit: 100 };
      if (cursor) query.before = cursor;
      const r = await this.http.get<any>(`/tasks/${taskId}/activities`, query);
      all.push(...(r.activities ?? []));
      hasMore = !!r.hasMore;
      cursor = r.cursor;
    }
    return all.reverse();
  }

  async getUsage(taskId: string): Promise<any> {
    return this.http.get<any>(`/tasks/${taskId}/usage`);
  }

  async getSchedulingSnapshot(taskId: string): Promise<any> {
    return this.http.get<any>(`/tasks/${taskId}/scheduling-snapshot`);
  }

  async schedulingPreview(taskId: string, body?: Record<string, unknown>): Promise<any> {
    return this.http.post<any>(`/tasks/${taskId}/scheduling-preview`, body ?? {});
  }
}
