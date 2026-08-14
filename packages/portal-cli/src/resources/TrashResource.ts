import type { HttpClient } from '../HttpClient.js';
import type { TrashKind, TrashListResponse, RestoreResponse } from '../types.js';

/**
 * Real backend paths are /portal/trash/{kind} for listing and a distinct
 * /portal/{skills|assistants|inbox}/:id/restore per kind for restoring —
 * NOT a generic /trash/:kind/:id/restore, despite the uniform TrashKind
 * parameter agnt-portal's own wrapper functions take.
 */
export class TrashResource {
  constructor(private http: HttpClient) {}

  async list(kind: TrashKind): Promise<TrashListResponse> {
    return this.http.get<TrashListResponse>(`/portal/trash/${kind}`);
  }

  async restore(kind: TrashKind, id: string): Promise<RestoreResponse> {
    return this.http.post<RestoreResponse>(`/portal/${kind}/${id}/restore`);
  }
}
