import type { HttpClient } from '../HttpClient.js';
import type { Calendar, CalendarEvent, CreateCalendarEventBody, UpdateCalendarEventBody } from '../types.js';

export class CalendarsResource {
  constructor(private http: HttpClient) {}

  async list(): Promise<Calendar[]> {
    const r = await this.http.get<any>('/calendars');
    return r.calendars ?? [];
  }

  async get(calendarId: string): Promise<Calendar> {
    const r = await this.http.get<any>(`/calendars/${calendarId}`);
    return r.calendar;
  }

  async listEvents(calendarId: string, startsAt: string, endsAt: string, timezone?: string): Promise<CalendarEvent[]> {
    const r = await this.http.get<any>(`/calendars/${calendarId}/events`, { startsAt, endsAt, timezone });
    return r.events ?? [];
  }

  async getEvent(calendarId: string, eventId: string): Promise<CalendarEvent> {
    const r = await this.http.get<any>(`/calendars/${calendarId}/events/${eventId}`);
    return r.event;
  }

  async createEvent(calendarId: string, body: CreateCalendarEventBody): Promise<CalendarEvent> {
    const r = await this.http.post<any>(`/calendars/${calendarId}/events`, body);
    return r.event;
  }

  async updateEvent(calendarId: string, eventId: string, body: UpdateCalendarEventBody): Promise<CalendarEvent> {
    const r = await this.http.patch<any>(`/calendars/${calendarId}/events/${eventId}`, body);
    return r.event;
  }

  async linkTask(calendarId: string, eventId: string, taskId: string): Promise<void> {
    await this.http.post(`/calendars/${calendarId}/events/${eventId}/linked-tasks`, { taskId });
  }

  async unlinkTask(calendarId: string, eventId: string, taskId: string): Promise<void> {
    await this.http.delete(`/calendars/${calendarId}/events/${eventId}/linked-tasks/${taskId}`);
  }
}
