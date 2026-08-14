import type { HttpClient } from '../HttpClient.js';
import type { User, UpdateMeBody } from '../types.js';

/**
 * Your own user profile. Real backend path is /profile, NOT /me — the
 * portal's own /api/me/* Next.js route proxies to /profile
 * (app/api/me/route.ts calls apiFetch(req, "/profile")); lib/api's function
 * names (getMe/updateMe/deleteMe) don't reflect the actual wire path.
 */
export class MeResource {
  constructor(private http: HttpClient) {}

  async get(): Promise<User> {
    const r = await this.http.get<any>('/profile');
    return r.user;
  }

  async update(body: UpdateMeBody): Promise<User> {
    const r = await this.http.patch<any>('/profile', body);
    return r.user;
  }

  /** Deletes your account. Irreversible. */
  async delete(): Promise<void> {
    await this.http.delete('/profile');
  }
}
