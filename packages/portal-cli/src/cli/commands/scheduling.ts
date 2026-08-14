import { clientFor } from '../utils/api.js';

export interface SchedulingOptions {
  profile?: string;
}

export async function runSchedulingSnapshot(taskId: string, opts: SchedulingOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const snapshot = await client.scheduling.getSnapshot(taskId);
  console.log(JSON.stringify(snapshot, null, 2));
}

export interface SchedulingPreviewOptions extends SchedulingOptions {
  excludeEmails?: string;
}

export async function runSchedulingPreview(taskId: string, opts: SchedulingPreviewOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const excludeEmails = opts.excludeEmails ? opts.excludeEmails.split(',').map(s => s.trim()).filter(Boolean) : undefined;
  const preview = await client.scheduling.previewSlots(taskId, { excludeEmails });
  console.log(JSON.stringify(preview, null, 2));
}
