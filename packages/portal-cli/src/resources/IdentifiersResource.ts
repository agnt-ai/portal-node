import type { HttpClient } from '../HttpClient.js';
import type { Identifier, CreateIdentifierBody, UpdateIdentifierBody } from '../types.js';

/**
 * Identifiers — verified emails/phones an account can be reached at. This is
 * what agnt-portal's own /api/connections endpoint actually operates on
 * (despite the name) — a different, older concept than ConnectionsResource
 * above, which wraps third-party OAuth integrations.
 *
 * Only the core CRUD (agnt-backend's /identifiers/* routes) is wrapped here.
 * The OTP-gated add/verify/resend flow (POST /portal/identifiers/add|verify|resend)
 * is a bigger, separate feature — awkward to script as a single CLI call
 * anyway (it's inherently two round-trips with a human in between to read
 * the code) — and calendar-sync/timeline endpoints on the same controller
 * aren't identifier CRUD at all. Left for later, not silently guessed at.
 */
export class IdentifiersResource {
  constructor(private http: HttpClient) {}

  async list(): Promise<Identifier[]> {
    const r = await this.http.get<any>('/identifiers');
    return r.identifiers ?? [];
  }

  async get(identifierId: string): Promise<Identifier> {
    const r = await this.http.get<any>(`/identifiers/${identifierId}`);
    return r.identifier;
  }

  async create(body: CreateIdentifierBody): Promise<Identifier> {
    const r = await this.http.post<any>('/identifiers', body);
    return r.identifier;
  }

  async update(identifierId: string, body: UpdateIdentifierBody): Promise<Identifier> {
    const r = await this.http.put<any>(`/identifiers/${identifierId}`, body);
    return r.identifier;
  }

  async delete(identifierId: string): Promise<void> {
    await this.http.delete(`/identifiers/${identifierId}`);
  }

  async makePrimary(identifierId: string): Promise<void> {
    await this.http.post(`/identifiers/${identifierId}/make-primary`);
  }
}
