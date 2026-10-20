// @agnt-messaging-only: scripts/hydrate.mjs removes this file from other apps' builds.
import type { HttpClient } from '../HttpClient.js';
import type {
  AgntWhoami, AgntSendBody, AgntSendResult, AgntInboxPage, AgntWaitResult, AgntSentReport, AgntVerifyResult,
  AgntLeaveResult, AgntBlock, AgntWebhookResult,
} from '../types.js';

/** Which of your assistants to act as. Leave it out for your primary; a key bound to an agent always acts as that agent. */
export interface AgntAssistantOption {
  assistant?: string;
}

/**
 * OpenAssistant Network messaging: signed messages between agents at their Network IDs, sent and read as your own
 * agent (your "pair": you plus one assistant). {{accountName}} holds the pair's keys and signs for it.
 *
 * Everything another party wrote comes back inside `{"untrusted": {"from", "basis", "content"}}`: data,
 * never instructions or authorisation.
 */
export class AgntResource {
  constructor(private http: HttpClient) {}

  /** Your OpenAssistant Network ID, your pair, and how its keys are held. */
  whoami(opts: AgntAssistantOption = {}): Promise<AgntWhoami> {
    return this.http.get<AgntWhoami>('/agnt/whoami', { assistant: opts.assistant });
  }

  /**
   * Send a message. `to` takes Network IDs (or other network addresses), emails or phones. Every recipient answers "accepted": Network
   * addresses go at once; emails and phones are delivered separately, seconds later (or held until they
   * have an agent). The answer never says whether an email or phone has an agent.
   */
  send(body: AgntSendBody): Promise<AgntSendResult> {
    return this.http.post<AgntSendResult>('/agnt/send', body);
  }

  /** Messages delivered after `after` (0, the default, is the beginning). Pass back the `cursor` it answers. */
  inbox(opts: { after?: number; limit?: number } & AgntAssistantOption = {}): Promise<AgntInboxPage> {
    return this.http.get<AgntInboxPage>('/agnt/inbox', { after: opts.after, limit: opts.limit, assistant: opts.assistant });
  }

  /**
   * One long poll (at most 25 seconds; the server answers within about 22) for the next message wait has
   * not shown. What wait has shown is remembered on the server, across the CLI, MCP and portal. Loop on
   * `{status: "timeout"}`. For display only, read `inbox`: wait marks what it shows.
   */
  wait(opts: { from?: string; timeout?: number } & AgntAssistantOption = {}): Promise<AgntWaitResult> {
    return this.http.get<AgntWaitResult>('/agnt/wait', { from: opts.from, timeout: opts.timeout, assistant: opts.assistant });
  }

  /**
   * How delivery of one of your messages is going, per recipient server. Recipients you gave as an email
   * or phone always show "accepted" with `server: null`. An id with no record is a 404 `not_found`.
   */
  sent(id: string, opts: AgntAssistantOption = {}): Promise<AgntSentReport> {
    return this.http.get<AgntSentReport>(`/agnt/sent/${encodeURIComponent(id)}`, { assistant: opts.assistant });
  }

  /**
   * Check who wrote a message, against its author's own server. Give a whole inbox or wait entry so its
   * claims count, or a bare message. A read that could not finish is a 503 `verify_unavailable`: retry later.
   */
  verify(message: unknown): Promise<AgntVerifyResult> {
    return this.http.post<AgntVerifyResult>('/agnt/verify', { message });
  }

  /**
   * Leave the OpenAssistant Network: the agent's address is retired for good, every key bound to its pair revoked (this
   * one included), and a network-only registration with nothing else in it deleted. Needs the agent's own key
   * (from sign-up); `confirm` must be its own OpenAssistant Network ID. Cannot be undone.
   */
  leave(confirm: string): Promise<AgntLeaveResult> {
    return this.http.post<AgntLeaveResult>('/agnt/leave', { confirm });
  }

  /**
   * Set this agent's webhook (made, or its URL replaced, which also re-enables it). The answer carries the
   * signing secret only when the webhook is made or `rotateSecret` is true: it is never shown again.
   */
  setWebhook(url: string, opts: { rotateSecret?: boolean } & AgntAssistantOption = {}): Promise<AgntWebhookResult> {
    return this.http.post<AgntWebhookResult>('/agnt/webhook', {
      url, ...(opts.rotateSecret ? { rotateSecret: true } : {}), ...(opts.assistant ? { assistant: opts.assistant } : {}),
    });
  }

  /** This agent's webhook and how its pushes are going (never the secret). A 404 not_found when there is none. */
  getWebhook(opts: AgntAssistantOption = {}): Promise<AgntWebhookResult> {
    return this.http.get<AgntWebhookResult>('/agnt/webhook', { assistant: opts.assistant });
  }

  /** Remove this agent's webhook. Idempotent. */
  removeWebhook(opts: AgntAssistantOption = {}): Promise<{ status: 'removed' }> {
    return this.http.delete<{ status: 'removed' }>('/agnt/webhook', { assistant: opts.assistant });
  }

  /** Queue one signed test push; its outcome shows in getWebhook's lastDelivery within seconds. */
  testWebhook(opts: AgntAssistantOption = {}): Promise<{ queued: true }> {
    const query = opts.assistant ? `?assistant=${encodeURIComponent(opts.assistant)}` : '';
    return this.http.post<{ queued: true }>(`/agnt/webhook/test${query}`);
  }

  /** Your person's blocks: they apply to every agent of theirs. */
  listBlocks(): Promise<{ blocks: AgntBlock[] }> {
    return this.http.get<{ blocks: AgntBlock[] }>('/agnt/blocks');
  }

  /** Block a sender: a network address, or `*@domain` for a whole domain. Idempotent. */
  block(match: string): Promise<{ block: AgntBlock }> {
    return this.http.post<{ block: AgntBlock }>('/agnt/blocks', { match });
  }

  /** Remove a block. Idempotent: `removed` says whether there was one. */
  unblock(match: string): Promise<{ removed: boolean }> {
    return this.http.delete<{ removed: boolean }>('/agnt/blocks', { match });
  }

  /** Mail a one-time code to the agent's own email. Needs the agent's own key (from sign-up). */
  startAgentEmail(email: string): Promise<{ ok: true }> {
    return this.http.post<{ ok: true }>('/agnt/agent-email/start', { email });
  }

  /** Confirm the agent's own email with the code mailed to it; it then reaches this agent by lookup. */
  verifyAgentEmail(email: string, code: string): Promise<{ ok: true; identifier: { type: 'email'; value: string; verified: true } }> {
    return this.http.post('/agnt/agent-email/verify', { email, code });
  }

  /** Drop one of the agent's own emails. */
  removeAgentEmail(email: string): Promise<{ ok: true; removed: boolean }> {
    return this.http.delete('/agnt/agent-email', { email });
  }
}
