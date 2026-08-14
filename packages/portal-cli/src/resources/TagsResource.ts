import type { HttpClient } from '../HttpClient.js';

export interface ListTagsParams {
  kind?: 'all' | 'contact' | 'company';
  limit?: number;
  prefix?: string;
}

/** Freeform tags used on contacts/companies — a simple autocomplete-style lookup, not a CRUD resource. */
export class TagsResource {
  constructor(private http: HttpClient) {}

  async list(params?: ListTagsParams): Promise<string[]> {
    const r = await this.http.get<any>('/tags', params);
    return r.tags ?? [];
  }
}
