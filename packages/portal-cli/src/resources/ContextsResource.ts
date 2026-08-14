import type { HttpClient } from '../HttpClient.js';
import type { Context, CreateContextBody, UpdateContextBody, ListContextsParams, ContextsPage } from '../types.js';

/** Structured context records — arbitrary tagged data blobs an assistant can retrieve by resourceType/tags. */
export class ContextsResource {
  constructor(private http: HttpClient) {}

  async list(params?: ListContextsParams): Promise<ContextsPage> {
    const r = await this.http.get<any>('/contexts', params);
    return { contexts: r.contexts ?? [], total: r.total ?? 0, page: r.page ?? 1, perPage: r.perPage ?? 50 };
  }

  async get(contextId: string): Promise<Context> {
    const r = await this.http.get<any>(`/contexts/${contextId}`);
    return r.context;
  }

  async create(body: CreateContextBody): Promise<Context> {
    const r = await this.http.post<any>('/contexts', body);
    return r.context;
  }

  async update(contextId: string, body: UpdateContextBody): Promise<Context> {
    const r = await this.http.put<any>(`/contexts/${contextId}`, body);
    return r.context;
  }

  async delete(contextId: string): Promise<void> {
    await this.http.delete(`/contexts/${contextId}`);
  }
}
