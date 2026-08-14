import type { HttpClient } from '../HttpClient.js';
import type { Memory, CreateMemoryBody, UpdateMemoryBody } from '../types.js';

const MAX_PER_PAGE = 100; // API hard ceiling — matches agnt-portal's lib/api/memories.ts
const MAX_PAGES = 20; // runaway guard: 20 pages = 2000 memories

export class MemoriesResource {
  constructor(private http: HttpClient) {}

  /** Lists ALL memories (auto-paginating), optionally filtered to a tag — same approach as agnt-portal's listMemories(). */
  async list(tag?: string): Promise<Memory[]> {
    const all: Memory[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const query: Record<string, any> = { page, perPage: MAX_PER_PAGE };
      if (tag) query.tags = tag;
      const r = await this.http.get<any>('/memories', query);
      const batch: Memory[] = r.memories ?? [];
      all.push(...batch);
      if (batch.length < MAX_PER_PAGE) break;
      if (typeof r.total === 'number' && all.length >= r.total) break;
    }
    return all;
  }

  async get(memoryId: string): Promise<Memory> {
    const r = await this.http.get<any>(`/memories/${memoryId}`);
    return r.memory;
  }

  async create(body: CreateMemoryBody): Promise<Memory> {
    const r = await this.http.post<any>('/memories', body);
    return r.memory;
  }

  async update(memoryId: string, body: UpdateMemoryBody): Promise<Memory> {
    const r = await this.http.put<any>(`/memories/${memoryId}`, body);
    return r.memory;
  }

  async delete(memoryId: string): Promise<void> {
    await this.http.delete(`/memories/${memoryId}`);
  }
}
