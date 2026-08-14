import type { HttpClient } from '../HttpClient.js';
import type { InboxItem } from '../types.js';

export class NotificationsResource {
  constructor(private http: HttpClient) {}

  /** perPage is pinned to 100 (the backend's own hard cap) — same fix agnt-portal's own listNotifications() applies, since the backend default of 20 silently truncated. */
  async list(archived = false): Promise<InboxItem[]> {
    const r = await this.http.get<any>('/notifications', { archived, perPage: 100 });
    return r.notifications ?? [];
  }

  async markRead(itemId: string): Promise<InboxItem> {
    const r = await this.http.put<any>(`/notifications/${itemId}`, { read: true });
    return r.notification;
  }

  async archive(itemId: string): Promise<InboxItem> {
    const r = await this.http.put<any>(`/notifications/${itemId}`, { archived: true });
    return r.notification;
  }

  async unarchive(itemId: string): Promise<InboxItem> {
    const r = await this.http.put<any>(`/notifications/${itemId}`, { archived: false });
    return r.notification;
  }

  async delete(itemId: string): Promise<void> {
    await this.http.delete(`/notifications/${itemId}`);
  }

  async markAllRead(): Promise<void> {
    await this.http.post('/notifications/mark-all-read');
  }
}
