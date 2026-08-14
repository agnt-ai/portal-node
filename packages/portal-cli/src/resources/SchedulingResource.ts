import type { HttpClient } from '../HttpClient.js';
import type { SchedulingSnapshot, SchedulingPreview } from '../types.js';

/** Live scheduling-engine state for a task — participant availability, grid, and strategy previews. */
export class SchedulingResource {
  constructor(private http: HttpClient) {}

  async getSnapshot(taskId: string): Promise<SchedulingSnapshot> {
    const r = await this.http.get<any>(`/tasks/${taskId}/scheduling-snapshot`);
    return r.snapshot;
  }

  /** Runs the solver against current availability without committing — optionally excluding some participants. */
  async previewSlots(taskId: string, opts: { excludeEmails?: string[] } = {}): Promise<SchedulingPreview> {
    const r = await this.http.post<any>(`/tasks/${taskId}/scheduling-preview`, opts);
    return r.preview;
  }
}
