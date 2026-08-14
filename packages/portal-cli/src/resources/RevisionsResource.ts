import type { HttpClient } from '../HttpClient.js';
import type { RevisionedKind, RevisionsResponse, UserRevisionsResponse, RestoreRevisionResult } from '../types.js';

/**
 * Revision history for revision-governed entities (memories, contacts,
 * companies, preferences, tasks, and the user's own profile). Restoring a
 * revision writes a NEW revision documenting the restore itself — "undo the
 * undo" is just another restore — unless `skipCapture` is passed.
 */
export class RevisionsResource {
  constructor(private http: HttpClient) {}

  private path(kind: RevisionedKind, id?: string): string {
    return kind === 'profile' ? '/me/profile/revisions' : `/${kind}/${id}/revisions`;
  }

  async list(kind: RevisionedKind, id?: string): Promise<RevisionsResponse> {
    return this.http.get<RevisionsResponse>(this.path(kind, id));
  }

  async restore(
    kind: RevisionedKind,
    id: string | undefined,
    revisionId: string,
    opts: { reason?: string; skipCapture?: boolean } = {}
  ): Promise<RestoreRevisionResult> {
    const base = kind === 'profile'
      ? `/me/profile/revisions/${revisionId}/restore`
      : `/${kind}/${id}/revisions/${revisionId}/restore`;
    return this.http.post<RestoreRevisionResult>(base, { reason: opts.reason, skipCapture: opts.skipCapture });
  }

  /** Cross-entity "everything Prime touched" feed for the current user. */
  async listForUser(opts: { model?: string; authorKind?: 'user' | 'agent' | 'system'; limit?: number } = {}): Promise<UserRevisionsResponse> {
    return this.http.get<UserRevisionsResponse>('/me/revisions', opts);
  }
}
