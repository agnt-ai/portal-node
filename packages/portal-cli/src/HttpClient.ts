/**
 * Thin HTTP client for the Agnt portal API.
 * Handles bearer-token injection, JSON parsing, and error handling.
 *
 * Unlike @agnt-sdk/client's HttpClient (which signs a fresh JWT per request
 * via a getToken callback), this one carries a static ak_live_... personal
 * API key — that's the credential minted by `{{accountSlug}} login`/`configure`,
 * not something re-signed per call.
 */

export interface AgntApiErrorExtras {
  /** The error body's `details`, when the server sent one. */
  details?: Record<string, unknown>;
  /** Seconds to wait before retrying, from a `Retry-After` header. */
  retryAfter?: number;
  /** The whole parsed error body, for fields beyond the common shape (e.g. 428's `confirm`). */
  body?: Record<string, unknown>;
}

export class AgntApiError extends Error {
  public readonly details?: Record<string, unknown>;
  public readonly retryAfter?: number;
  public readonly body?: Record<string, unknown>;

  constructor(
    public readonly status: number,
    message: string,
    public readonly errorCode?: string,
    extras: AgntApiErrorExtras = {}
  ) {
    super(message);
    this.name = 'AgntApiError';
    this.details = extras.details;
    this.retryAfter = extras.retryAfter;
    this.body = extras.body;
  }
}

/** `Retry-After` as whole seconds: either delta-seconds or an HTTP date. Undefined when absent or unreadable. */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^[0-9]+$/.test(trimmed)) return Number(trimmed);
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, Math.ceil((at - now) / 1000));
}

/** An AgntApiError from a non-ok response's status, headers and body text. */
function errorFromResponse(response: Response, text: string): AgntApiError {
  let message = text;
  let errorCode: string | undefined;
  let body: Record<string, unknown> | undefined;
  try {
    const json = JSON.parse(text);
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      body = json;
      message = json.error ?? text;
      errorCode = json.error_code;
    }
  } catch {
    /* use raw text */
  }
  const details = body?.details && typeof body.details === 'object' ? body.details as Record<string, unknown> : undefined;
  const retryAfter = parseRetryAfter(response.headers?.get?.('retry-after'));
  return new AgntApiError(response.status, message, errorCode, { details, retryAfter, body });
}

/** The header that names the calling CLI's version, so the server can refuse a copy older than it serves. */
export const CLIENT_VERSION_HEADER = 'x-agnt-cli-version';
let clientVersion: string | undefined;

/** Set once by the CLI at start-up; a library caller that never sets it sends no version. */
export function setClientVersion(version: string | undefined): void {
  clientVersion = version;
}

const versionHeader = (): Record<string, string> => (clientVersion ? { [CLIENT_VERSION_HEADER]: clientVersion } : {});

export interface SseEvent {
  event: string;
  data: any;
}

/** Parses one `text/event-stream` buffer of complete "event: X\ndata: Y\n\n" blocks, returning parsed events and any trailing partial block to carry into the next chunk. */
function parseSseBuffer(buffer: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = [];
  let rest = buffer;
  let idx: number;
  while ((idx = rest.indexOf('\n\n')) !== -1) {
    const raw = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    const eventMatch = raw.match(/^event: ?(.*)$/m);
    const dataMatch = raw.match(/^data: ?(.*)$/m);
    if (!dataMatch) continue;
    let data: any;
    try {
      data = JSON.parse(dataMatch[1]);
    } catch {
      data = dataMatch[1];
    }
    events.push({ event: eventMatch?.[1] ?? 'message', data });
  }
  return { events, rest };
}

export class HttpClient {
  private apiUrl: string;
  private apiKey: string;

  constructor(apiUrl: string, apiKey: string) {
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  private async request<T>(method: string, path: string, body?: any, params?: Record<string, any>, timeoutMs?: number): Promise<T> {
    let url = `${this.apiUrl}${path}`;
    if (params && Object.keys(params).length > 0) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) qs.set(k, String(v));
      }
      url += `?${qs.toString()}`;
    }

    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...versionHeader(),
      }
    };

    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    // A long poll that stalls (a laptop asleep, a dropped network) ends with a TimeoutError instead of hanging.
    if (timeoutMs !== undefined) init.signal = AbortSignal.timeout(timeoutMs);

    const response = await fetch(url, init);

    if (!response.ok) {
      throw errorFromResponse(response, await response.text());
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  get<T>(path: string, params?: Record<string, any>, opts: { timeoutMs?: number } = {}): Promise<T> {
    return this.request<T>('GET', path, undefined, params, opts.timeoutMs);
  }

  post<T>(path: string, body?: any, opts: { timeoutMs?: number } = {}): Promise<T> {
    return this.request<T>('POST', path, body, undefined, opts.timeoutMs);
  }

  put<T>(path: string, body?: any): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  patch<T>(path: string, body?: any): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  delete<T>(path: string, params?: Record<string, any>, opts: { timeoutMs?: number } = {}): Promise<T> {
    return this.request<T>('DELETE', path, undefined, params, opts.timeoutMs);
  }

  /**
   * GETs bytes: the response body as a stream, so a large file is never held in memory here. A non-ok answer is the
   * same AgntApiError as any other call. The caller reads the body to its end (or cancels it).
   */
  async getStream(path: string, params?: Record<string, any>, opts: { timeoutMs?: number } = {}): Promise<{ body: ReadableStream<Uint8Array>; contentLength?: number }> {
    let url = `${this.apiUrl}${path}`;
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== null) qs.set(k, String(v));
    if ([...qs].length) url += `?${qs.toString()}`;
    const init: RequestInit = { method: 'GET', headers: { Authorization: `Bearer ${this.apiKey}`, ...versionHeader() } };
    if (opts.timeoutMs !== undefined) init.signal = AbortSignal.timeout(opts.timeoutMs);
    const response = await fetch(url, init);
    if (!response.ok) throw errorFromResponse(response, await response.text());
    if (!response.body) throw new AgntApiError(502, 'The answer had no body.', 'empty_body');
    const length = Number(response.headers.get('content-length'));
    return { body: response.body, ...(Number.isSafeInteger(length) && length >= 0 && response.headers.get('content-length') !== null ? { contentLength: length } : {}) };
  }

  /**
   * PUTs bytes to a signed upload URL the API handed out (a file's upload to the agent's own network server), with
   * exactly the headers it named. Never carries this client's API key or version: the URL is another server's, and it
   * needs only its own signature. A redirect is never followed: it is refused as a 302 AgntApiError `upload_redirect`
   * (`redirect: 'error'`, not 'manual': with 'manual' the fetch keeps every byte of a stream body to replay it, which holds the
   * whole file in memory). `body` is the file's `size` bytes, as a stream (sent a chunk at a time) or bytes already in
   * memory. A non-ok answer is an AgntApiError.
   */
  async putSigned(url: string, headers: Record<string, string>, body: ReadableStream<Uint8Array> | Uint8Array, size: number, opts: { timeoutMs?: number } = {}): Promise<void> {
    const sent: Record<string, string> = {};
    // The length is this call's own, from the file; a hop-by-hop header named by the server must not change it.
    for (const [k, v] of Object.entries(headers)) if (!/^(content-length|host|connection|transfer-encoding)$/i.test(k)) sent[k] = v;
    sent['Content-Length'] = String(size);
    const init: RequestInit & { duplex?: 'half' } = { method: 'PUT', headers: sent, redirect: 'error' };
    if (size > 0) {
      init.body = body as any;
      if (!(body instanceof Uint8Array)) init.duplex = 'half';
    }
    if (opts.timeoutMs !== undefined) init.signal = AbortSignal.timeout(opts.timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (err) {
      // fetch reports a refused redirect as a failed fetch whose cause says so: that is the server's answer, not a lost connection.
      if (err instanceof TypeError && /redirect/i.test(String((err as { cause?: { message?: unknown } }).cause?.message ?? ''))) {
        throw new AgntApiError(302, 'The upload address answered with a redirect, which is never followed.', 'upload_redirect');
      }
      throw err;
    }
    if (response.ok) {
      await response.body?.cancel();
      return;
    }
    throw errorFromResponse(response, await response.text());
  }

  /**
   * POSTs to a Server-Sent-Events endpoint (e.g. /chats/:id/process) and
   * yields each parsed { event, data } as it arrives — for a live, token-
   * by-token-feeling reply rather than waiting for the whole response.
   */
  async *stream(path: string, body?: any): AsyncGenerator<SseEvent> {
    const response = await fetch(`${this.apiUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body ?? {})
    });

    if (!response.ok) {
      throw errorFromResponse(response, await response.text());
    }

    if (!response.body) return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseSseBuffer(buffer);
      buffer = rest;
      for (const event of events) yield event;
    }
  }
}

/** A bearer-less variant for the two pre-auth signup endpoints. */
export async function publicRequest<T>(apiUrl: string, path: string, body: any): Promise<T> {
  const response = await fetch(`${apiUrl.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...versionHeader() },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = { error: text };
  }

  if (!response.ok) {
    throw errorFromResponse(response, text);
  }

  return json as T;
}
