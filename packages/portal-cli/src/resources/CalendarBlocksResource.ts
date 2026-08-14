import type { HttpClient } from '../HttpClient.js';
import type { CalendarBlock, CreateCalendarBlockBody, UpdateCalendarBlockBody } from '../types.js';

/** Manual busy-time blocks that keep a window free of scheduling — distinct from CalendarEvent. */
export class CalendarBlocksResource {
  constructor(private http: HttpClient) {}

  async list(startsAt?: string, endsAt?: string): Promise<CalendarBlock[]> {
    const r = await this.http.get<any>('/calendar-blocks', { startsAt, endsAt });
    return r.blocks ?? [];
  }

  async create(body: CreateCalendarBlockBody): Promise<CalendarBlock> {
    const r = await this.http.post<any>('/calendar-blocks', body);
    return r.block;
  }

  async update(blockId: string, body: UpdateCalendarBlockBody): Promise<CalendarBlock> {
    const r = await this.http.patch<any>(`/calendar-blocks/${blockId}`, body);
    return r.block;
  }

  async delete(blockId: string): Promise<void> {
    await this.http.delete(`/calendar-blocks/${blockId}`);
  }
}
