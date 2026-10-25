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

  private async request<T>(method: string, path: string, body?: any, params?: Record<string, any>): Promise<T> {
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
        'Content-Type': 'application/json'
      }
    };

    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    const response = await fetch(url, init);

    if (!response.ok) {
      throw errorFromResponse(response, await response.text());
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  get<T>(path: string, params?: Record<string, any>): Promise<T> {
    return this.request<T>('GET', path, undefined, params);
  }

  post<T>(path: string, body?: any): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  put<T>(path: string, body?: any): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  patch<T>(path: string, body?: any): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
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
    headers: { 'Content-Type': 'application/json' },
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
