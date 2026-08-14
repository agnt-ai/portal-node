import type { HttpClient } from '../HttpClient.js';
import type {
  Company, CreateCompanyBody, UpdateCompanyBody, ListCompaniesParams,
  CompaniesPage, FindOrCreateCompanyBody, FindOrCreateCompanyResult, BulkTagResult,
  Contact,
} from '../types.js';

/**
 * Companies — the universal, deduped company directory contacts link to.
 * A company is visible to a user only if one of their own contacts works
 * there, or they added the company themselves (see companiesController.mjs's
 * visibleCompanyIds — enforced server-side, not something the CLI filters).
 */
export class CompaniesResource {
  constructor(private http: HttpClient) {}

  async list(params?: ListCompaniesParams): Promise<CompaniesPage> {
    const query: Record<string, any> = { ...params };
    if (Array.isArray(params?.tags)) query.tags = params!.tags.join(',');
    const r = await this.http.get<any>('/companies', query);
    return { companies: r.companies ?? [], total: r.total ?? 0, page: r.page ?? 1, perPage: r.perPage ?? 50 };
  }

  async search(q: string, limit?: number): Promise<Company[]> {
    const r = await this.http.get<any>('/companies/search', { q, limit });
    return r.companies ?? [];
  }

  async get(companyId: string): Promise<Company> {
    const r = await this.http.get<any>(`/companies/${companyId}`);
    return r.company;
  }

  async create(body: CreateCompanyBody): Promise<Company> {
    const r = await this.http.post<any>('/companies', body);
    return r.company;
  }

  /** Find an existing company by name/domain/slug, or create one — returns `created`/`alreadyExists` flags. */
  async findOrCreate(body: FindOrCreateCompanyBody): Promise<FindOrCreateCompanyResult> {
    const r = await this.http.post<any>('/companies/find-or-create', body);
    return r.company;
  }

  async update(companyId: string, body: UpdateCompanyBody): Promise<Company> {
    const r = await this.http.put<any>(`/companies/${companyId}`, body);
    return r.company;
  }

  async delete(companyId: string): Promise<void> {
    await this.http.delete(`/companies/${companyId}`);
  }

  /** Org-admin/service only (assertOrgAdmin-gated server-side) — writes system fields like description/enrichedAt. */
  async enrich(companyId: string, body: Record<string, unknown>): Promise<Company> {
    const r = await this.http.put<any>(`/companies/${companyId}/enrich`, body);
    return r.company;
  }

  async listContacts(companyId: string): Promise<Contact[]> {
    const r = await this.http.get<any>(`/companies/${companyId}/contacts`);
    return r.contacts ?? [];
  }

  /** Add and/or remove tags across up to 1000 companies in one call — at least one of add/remove is required. */
  async bulkTag(ids: string[], opts: { add?: string[]; remove?: string[] }): Promise<BulkTagResult> {
    const r = await this.http.post<any>('/companies/bulk-tag', { ids, add: opts.add, remove: opts.remove });
    return r.bulkTag;
  }
}
