import type { HttpClient } from '../HttpClient.js';
import type { DriveFile, ListDriveFilesParams, DriveFilesPage } from '../types.js';

/**
 * Drive — files your agents create/attach, visible and manageable by you.
 * Real backend path is /drive-files/*, NOT /drive/* — agnt-portal's own
 * /api/drive/* Next.js routes rewrite to /drive-files/* internally
 * (app/api/drive/[fileId]/route.ts calls apiFetch(req, `/drive-files/${fileId}`)).
 *
 * Upload isn't wrapped — it needs multipart/binary handling, a bigger scope
 * item than the rest of this resource. Left for later, not guessed at.
 */
export class DriveResource {
  constructor(private http: HttpClient) {}

  async list(params?: ListDriveFilesParams): Promise<DriveFilesPage> {
    const query: Record<string, any> = { ...params };
    if (Array.isArray(params?.tags)) query.tags = params!.tags.join(',');
    const r = await this.http.get<any>('/drive-files', query);
    return { driveFiles: r.driveFiles ?? [], total: r.total ?? 0, page: r.page ?? 1, perPage: r.perPage ?? 50 };
  }

  async get(fileId: string): Promise<DriveFile> {
    const r = await this.http.get<any>(`/drive-files/${fileId}`);
    return r.driveFile;
  }

  /** Returns a presigned download URL, valid for 15 minutes. */
  async getDownloadUrl(fileId: string): Promise<string> {
    const r = await this.http.get<any>(`/drive-files/${fileId}/download`);
    return r.url;
  }

  async rename(fileId: string, name: string): Promise<DriveFile> {
    const r = await this.http.patch<any>(`/drive-files/${fileId}`, { name });
    return r.driveFile;
  }

  async move(fileId: string, folderId: string | null): Promise<DriveFile> {
    const r = await this.http.patch<any>(`/drive-files/${fileId}/move`, { folder: folderId });
    return r.driveFile;
  }

  async delete(fileId: string): Promise<void> {
    await this.http.delete(`/drive-files/${fileId}`);
  }

  async linkTask(fileId: string, taskId: string): Promise<void> {
    await this.http.post(`/drive-files/${fileId}/link-task`, { taskId });
  }

  async unlinkTask(fileId: string, taskId: string): Promise<void> {
    await this.http.delete(`/drive-files/${fileId}/unlink-task/${taskId}`);
  }
}
