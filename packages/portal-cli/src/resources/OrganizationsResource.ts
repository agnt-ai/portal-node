import type { HttpClient } from '../HttpClient.js';
import type { Organization, OrganizationsPage } from '../types.js';

/** Org-admin actions — requires an org admin role on the calling user (or an unscoped/account-wide API key). */
export class OrganizationsResource {
  constructor(private http: HttpClient) {}

  async list(params?: { page?: number; perPage?: number }): Promise<OrganizationsPage> {
    const r = await this.http.get<any>('/organizations', params);
    return { organizations: r.organizations ?? [], total: r.total ?? 0, page: r.page ?? 1, perPage: r.perPage ?? 50 };
  }

  async get(orgId: string): Promise<Organization> {
    const r = await this.http.get<any>(`/organizations/${orgId}`);
    return r.organization;
  }

  async create(name: string): Promise<Organization> {
    const r = await this.http.post<any>('/organizations', { name });
    return r.organization;
  }

  async update(orgId: string, body: { name?: string }): Promise<Organization> {
    const r = await this.http.put<any>(`/organizations/${orgId}`, body);
    return r.organization;
  }

  async delete(orgId: string): Promise<void> {
    await this.http.delete(`/organizations/${orgId}`);
  }
}
