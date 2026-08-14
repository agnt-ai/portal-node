import type { HttpClient } from '../HttpClient.js';
import type {
  SchedulingTable, CreateSchedulingTableBody, UpdateSchedulingTableBody,
  AddSlotsBody, AddParticipantsBody, UpdateParticipantBody, SubmitResponsesBody,
} from '../types.js';

/**
 * Scheduling tables — "when2meet"-style shared availability grids: a host
 * proposes candidate slots, invites participants, participants respond, the
 * host picks a winner. Public/unauthenticated participant-facing endpoints
 * (shared-token join/respond, used by people without an AGNT account) aren't
 * wrapped here — this resource is for the authenticated table owner.
 */
export class SchedulingTablesResource {
  constructor(private http: HttpClient) {}

  async list(): Promise<SchedulingTable[]> {
    const r = await this.http.get<any>('/scheduling-tables');
    return r.schedulingTables ?? [];
  }

  async create(body: CreateSchedulingTableBody): Promise<SchedulingTable> {
    const r = await this.http.post<any>('/scheduling-tables', body);
    return r.schedulingTable;
  }

  async get(tableId: string): Promise<SchedulingTable> {
    const r = await this.http.get<any>(`/scheduling-tables/${tableId}`);
    return r.schedulingTable;
  }

  async update(tableId: string, body: UpdateSchedulingTableBody): Promise<SchedulingTable> {
    const r = await this.http.patch<any>(`/scheduling-tables/${tableId}`, body);
    return r.schedulingTable;
  }

  async delete(tableId: string): Promise<void> {
    await this.http.delete(`/scheduling-tables/${tableId}`);
  }

  async addSlots(tableId: string, body: AddSlotsBody): Promise<SchedulingTable> {
    const r = await this.http.post<any>(`/scheduling-tables/${tableId}/slots`, body);
    return r.schedulingTable;
  }

  async removeSlot(tableId: string, slotId: string): Promise<SchedulingTable> {
    const r = await this.http.delete<any>(`/scheduling-tables/${tableId}/slots/${slotId}`);
    return r.schedulingTable;
  }

  async addParticipants(tableId: string, body: AddParticipantsBody): Promise<SchedulingTable> {
    const r = await this.http.post<any>(`/scheduling-tables/${tableId}/participants`, body);
    return r.schedulingTable;
  }

  async updateParticipant(tableId: string, participantId: string, body: UpdateParticipantBody): Promise<SchedulingTable> {
    const r = await this.http.patch<any>(`/scheduling-tables/${tableId}/participants/${participantId}`, body);
    return r.schedulingTable;
  }

  async removeParticipant(tableId: string, participantId: string): Promise<SchedulingTable> {
    const r = await this.http.delete<any>(`/scheduling-tables/${tableId}/participants/${participantId}`);
    return r.schedulingTable;
  }

  /** Re-sends the invite email to a participant. */
  async sendInvite(tableId: string, participantId: string): Promise<SchedulingTable> {
    const r = await this.http.post<any>(`/scheduling-tables/${tableId}/participants/${participantId}/invite`, undefined);
    return r.schedulingTable;
  }

  async submitResponses(tableId: string, participantId: string, body: SubmitResponsesBody): Promise<SchedulingTable> {
    const r = await this.http.put<any>(`/scheduling-tables/${tableId}/participants/${participantId}/responses`, body);
    return r.schedulingTable;
  }
}
