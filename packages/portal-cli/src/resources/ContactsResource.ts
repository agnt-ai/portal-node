import type { HttpClient } from '../HttpClient.js';
import type {
  Contact, CreateContactBody, UpdateContactBody, ListContactsParams,
  ContactsPage, ContactActivity, BulkTagResult
} from '../types.js';

/**
 * Contacts — core CRUD + activity + bulk-tag. Relationships, merge, and
 * external-id linking (agnt-backend's /contacts/:id/relationships,
 * /contacts/:id/merge, /contacts/:id/external-ids/:integration) aren't
 * wrapped yet — narrower, admin-ish actions less likely to be an agent's
 * first need. Add them the same way if/when needed.
 */
export class ContactsResource {
  constructor(private http: HttpClient) {}

  async list(params?: ListContactsParams): Promise<ContactsPage> {
    const query: Record<string, any> = { ...params };
    if (Array.isArray(params?.sourceType)) query.sourceType = params!.sourceType.join(',');
    if (Array.isArray(params?.tags)) query.tags = params!.tags.join(',');
    const r = await this.http.get<any>('/contacts', query);
    return { contacts: r.contacts ?? [], total: r.total ?? 0, page: r.page ?? 1, perPage: r.perPage ?? 50 };
  }

  async get(contactId: string): Promise<Contact> {
    const r = await this.http.get<any>(`/contacts/${contactId}`);
    return r.contact;
  }

  async create(body: CreateContactBody): Promise<Contact> {
    const r = await this.http.post<any>('/contacts', body);
    return r.contact ?? r;
  }

  async update(contactId: string, body: UpdateContactBody): Promise<Contact> {
    const r = await this.http.put<any>(`/contacts/${contactId}`, body);
    return r.contact;
  }

  async delete(contactId: string): Promise<void> {
    await this.http.delete(`/contacts/${contactId}`);
  }

  async activity(contactId: string): Promise<ContactActivity> {
    const r = await this.http.get<any>(`/contacts/${contactId}/activity`);
    return r.activity;
  }

  /** Add and/or remove tags across up to 1000 contacts in one call — at least one of add/remove is required. */
  async bulkTag(ids: string[], opts: { add?: string[]; remove?: string[] }): Promise<BulkTagResult> {
    const r = await this.http.post<any>('/contacts/bulk-tag', { ids, add: opts.add, remove: opts.remove });
    return r.bulkTag;
  }
}
