import type { HttpClient } from '../HttpClient.js';
import type { Skill, SkillInstall, ListSkillsParams } from '../types.js';

/**
 * Skills — installed workflows/integrations on your account. Core CRUD +
 * run-now only; the store/marketplace browsing side (skills/store/*,
 * skillStore.ts's browse/install-from-store flow) isn't wrapped yet — a
 * separate, bigger feature (search, permissions, install requests).
 */
export class SkillsResource {
  constructor(private http: HttpClient) {}

  async list(params?: ListSkillsParams): Promise<Skill[]> {
    const r = await this.http.get<any>('/skills', params);
    return r.skills ?? [];
  }

  async get(skillId: string): Promise<Skill & { install?: SkillInstall }> {
    const r = await this.http.get<any>(`/skills/${skillId}`);
    return r.skill;
  }

  async create(body: Record<string, unknown>): Promise<Skill> {
    const r = await this.http.post<any>('/skills', body);
    return r.skill;
  }

  async update(skillId: string, body: Record<string, unknown>): Promise<Skill> {
    const r = await this.http.patch<any>(`/skills/${skillId}`, body);
    return r.skill;
  }

  async delete(skillId: string): Promise<void> {
    await this.http.delete(`/skills/${skillId}`);
  }

  /** Runs a workflow skill immediately, off its normal schedule — returns the resulting task. */
  async runNow(skillId: string): Promise<{ id: string; [key: string]: unknown }> {
    const r = await this.http.post<any>(`/skills/${skillId}/run`);
    return r.task;
  }

  /** Despite the name, these two endpoints respond with envelope key 'skill' (a skill+install composite), not 'install' — verified against skillsController.mjs, not guessed. */
  async getInstall(installId: string): Promise<Skill & { install?: SkillInstall }> {
    const r = await this.http.get<any>(`/skills/installs/${installId}`);
    return r.skill;
  }

  async updateInstall(installId: string, body: Record<string, unknown>): Promise<Skill & { install?: SkillInstall }> {
    const r = await this.http.patch<any>(`/skills/installs/${installId}`, body);
    return r.skill;
  }

  async deleteInstall(installId: string): Promise<void> {
    await this.http.delete(`/skills/installs/${installId}`);
  }
}
