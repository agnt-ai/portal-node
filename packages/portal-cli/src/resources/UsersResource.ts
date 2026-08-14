import type { HttpClient } from '../HttpClient.js';
import type { User, CreateUserBody, UpdateUserBody, UsersPage } from '../types.js';

/** Account members — list/get are broadly usable; create/delete are provisioning actions gated behind org-admin. */
export class UsersResource {
  constructor(private http: HttpClient) {}

  async list(params?: { page?: number; perPage?: number }): Promise<UsersPage> {
    const r = await this.http.get<any>('/users', params);
    return { users: r.users ?? [], total: r.total ?? 0, page: r.page ?? 1, perPage: r.perPage ?? 50 };
  }

  async get(userId: string): Promise<User> {
    const r = await this.http.get<any>(`/users/${userId}`);
    return r.user;
  }

  /** Provisioning action — requires org-admin. */
  async create(body: CreateUserBody): Promise<User> {
    const r = await this.http.post<any>('/users', body);
    return r.user;
  }

  async update(userId: string, body: UpdateUserBody): Promise<User> {
    const r = await this.http.put<any>(`/users/${userId}`, body);
    return r.user;
  }

  /** Deprovisioning action — requires org-admin. */
  async delete(userId: string): Promise<void> {
    await this.http.delete(`/users/${userId}`);
  }
}
