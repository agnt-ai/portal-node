import type { HttpClient } from '../HttpClient.js';
import type { BookingLink, CreateBookingLinkBody, UpdateBookingLinkBody } from '../types.js';

export class BookingLinksResource {
  constructor(private http: HttpClient) {}

  async list(): Promise<BookingLink[]> {
    const r = await this.http.get<any>('/booking-links');
    return r.bookingLinks ?? [];
  }

  async get(bookingLinkId: string): Promise<BookingLink> {
    const r = await this.http.get<any>(`/booking-links/${bookingLinkId}`);
    return r.bookingLink;
  }

  async create(body: CreateBookingLinkBody): Promise<BookingLink> {
    const r = await this.http.post<any>('/booking-links', body);
    return r.bookingLink;
  }

  async update(bookingLinkId: string, body: UpdateBookingLinkBody): Promise<BookingLink> {
    const r = await this.http.put<any>(`/booking-links/${bookingLinkId}`, body);
    return r.bookingLink;
  }

  async delete(bookingLinkId: string): Promise<void> {
    await this.http.delete(`/booking-links/${bookingLinkId}`);
  }
}
