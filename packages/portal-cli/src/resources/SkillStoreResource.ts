import type { HttpClient } from '../HttpClient.js';
import type { StoreItem, StoreFilters, BrowseStoreResult, StorePermissions, StoreAccessItem, StoreAccessRequest } from '../types.js';

/**
 * Skill marketplace — browsing/installing distinct from SkillsResource's
 * CRUD over skills you own. `agnt`/`official`/`community` tiers, plus the
 * org-admin request/approve/decline flow for manual-approval skills.
 */
export class SkillStoreResource {
  constructor(private http: HttpClient) {}

  async browse(filters: StoreFilters = {}): Promise<BrowseStoreResult> {
    return this.http.get<BrowseStoreResult>('/skills/store', filters);
  }

  async get(accountSlug: string, skillSlug: string): Promise<StoreItem> {
    const r = await this.http.get<any>(`/skills/store/${accountSlug}/${skillSlug}`);
    return r.skill;
  }

  /** Auto-approval skills install immediately; manual-approval skills should use requestAccess() instead. */
  async install(accountSlug: string, skillSlug: string): Promise<{ installId: string }> {
    return this.http.post<{ installId: string }>(`/skills/store/${accountSlug}/${skillSlug}/use`, undefined);
  }

  async uninstall(accountSlug: string, skillSlug: string): Promise<void> {
    await this.http.delete(`/skills/store/${accountSlug}/${skillSlug}/use`);
  }

  /** For manual-approval skills — creates a pending request the skill's owner must approve/decline. */
  async requestAccess(accountSlug: string, skillSlug: string, message?: string): Promise<{ installId: string; status: string }> {
    return this.http.post<{ installId: string; status: string }>(`/skills/store/${accountSlug}/${skillSlug}/request`, { message });
  }

  async getPermissions(): Promise<StorePermissions> {
    const r = await this.http.get<any>('/skills/store/permissions');
    return r.permissions;
  }

  /** Non-own installs — grant (admin-pushed) or import (self-installed). */
  async myAccess(): Promise<StoreAccessItem[]> {
    const r = await this.http.get<any>('/skills/store/my-access');
    return r.items ?? [];
  }

  /** Pending access requests for skills you own, awaiting your approval. */
  async listIncomingRequests(): Promise<StoreAccessRequest[]> {
    const r = await this.http.get<any>('/skills/store/requests/incoming');
    return r.requests ?? [];
  }

  async approveRequest(installId: string): Promise<{ installId: string }> {
    return this.http.post<{ installId: string }>(`/skills/store/requests/${installId}/approve`, undefined);
  }

  async declineRequest(installId: string): Promise<{ installId: string }> {
    return this.http.post<{ installId: string }>(`/skills/store/requests/${installId}/decline`, undefined);
  }
}
