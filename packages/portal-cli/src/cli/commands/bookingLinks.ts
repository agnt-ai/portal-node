import { clientFor } from '../utils/api.js';

export interface BookingLinksListOptions {
  profile?: string;
  json?: boolean;
}

export async function runBookingLinksList(opts: BookingLinksListOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const links = await client.bookingLinks.list();

  if (opts.json) {
    console.log(JSON.stringify(links, null, 2));
    return;
  }
  if (!links.length) {
    console.log('No booking links found.');
    return;
  }
  for (const link of links) {
    console.log(`${link.id}  ${(link as any).slug ?? ''}  ${(link as any).title ?? ''}`);
  }
}

export interface BookingLinksGetOptions {
  profile?: string;
  json?: boolean;
}

export async function runBookingLinksGet(bookingLinkId: string, opts: BookingLinksGetOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const link = await client.bookingLinks.get(bookingLinkId);
  console.log(JSON.stringify(link, null, 2));
}

export interface BookingLinksDeleteOptions {
  profile?: string;
}

export async function runBookingLinksDelete(bookingLinkId: string, opts: BookingLinksDeleteOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.bookingLinks.delete(bookingLinkId);
  console.log(`Deleted booking link ${bookingLinkId}.`);
}
