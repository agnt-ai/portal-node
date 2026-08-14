import type { HttpClient } from '../HttpClient.js';
import type { Team, TeamMember, TeamsPage, TeamMembersPage } from '../types.js';

export class TeamsResource {
  constructor(private http: HttpClient) {}

  async list(params?: { page?: number; perPage?: number }): Promise<TeamsPage> {
    const r = await this.http.get<any>('/teams', params);
    return { teams: r.teams ?? [], total: r.total ?? 0, page: r.page ?? 1, perPage: r.perPage ?? 50 };
  }

  async get(teamId: string): Promise<Team> {
    const r = await this.http.get<any>(`/teams/${teamId}`);
    return r.team;
  }

  async create(name: string): Promise<Team> {
    const r = await this.http.post<any>('/teams', { name });
    return r.team;
  }

  async update(teamId: string, body: { name?: string }): Promise<Team> {
    const r = await this.http.put<any>(`/teams/${teamId}`, body);
    return r.team;
  }

  async delete(teamId: string): Promise<void> {
    await this.http.delete(`/teams/${teamId}`);
  }

  async listMembers(teamId: string, params?: { page?: number; perPage?: number }): Promise<TeamMembersPage> {
    const r = await this.http.get<any>(`/teams/${teamId}/members`, params);
    return { members: r.members ?? [], total: r.total ?? 0, page: r.page ?? 1, perPage: r.perPage ?? 50 };
  }

  /** Adds userId to the team — enforces the single-active-team-per-account invariant (may require newOwnerId if userId already owns another team). */
  async addMember(teamId: string, userId: string, role: 'owner' | 'admin' | 'member' = 'member', newOwnerId?: string): Promise<TeamMember> {
    const r = await this.http.post<any>(`/teams/${teamId}/members`, { userId, role, newOwnerId });
    return r.member;
  }

  async updateMember(teamId: string, memberId: string, body: { role?: string }): Promise<TeamMember> {
    const r = await this.http.put<any>(`/teams/${teamId}/members/${memberId}`, body);
    return r.member;
  }

  async removeMember(teamId: string, memberId: string): Promise<void> {
    await this.http.delete(`/teams/${teamId}/members/${memberId}`);
  }

  async transferOwnership(teamId: string, newOwnerId: string): Promise<void> {
    await this.http.post(`/teams/${teamId}/transfer-ownership`, { newOwnerId });
  }
}
