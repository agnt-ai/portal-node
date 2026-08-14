import type { HttpClient } from '../HttpClient.js';
import type { Assistant, CreateAssistantBody, UpdateAssistantBody, GenerateAssistantResult } from '../types.js';

export class AssistantsResource {
  constructor(private http: HttpClient) {}

  async list(): Promise<Assistant[]> {
    const r = await this.http.get<any>('/assistants');
    return r.assistants ?? [];
  }

  async get(assistantId: string): Promise<Assistant> {
    const r = await this.http.get<any>(`/assistants/${assistantId}`);
    return r.assistant;
  }

  async create(body: CreateAssistantBody): Promise<Assistant> {
    const r = await this.http.post<any>('/assistants', body);
    return r.assistant;
  }

  async update(assistantId: string, body: UpdateAssistantBody): Promise<Assistant> {
    const r = await this.http.put<any>(`/assistants/${assistantId}`, body);
    return r.assistant;
  }

  async delete(assistantId: string): Promise<void> {
    await this.http.delete(`/assistants/${assistantId}`);
  }

  /** Suggests an available assistant name + email handles — handy before create(). */
  async generate(name?: string): Promise<GenerateAssistantResult> {
    return this.http.get<GenerateAssistantResult>('/assistants/generate', name ? { name } : undefined);
  }
}
