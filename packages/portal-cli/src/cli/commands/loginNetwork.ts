/**
 * The {{accountName}} Network part of {{accountSlug}} login: the agent sign-up fields (--purpose and --agent-*), the
 * guidance for their refusals, and what login says once the agent has its {{accountName}} Network ID.
 */

import type { AgntApiError } from '../../HttpClient.js';
import type {
  AgentAuthVerifyFields, AgentAuthVerifyResult, AgentSignupAgent, AgentSignupPurpose,
} from '../../types.js';
import type { LoginOptions } from './login.js';
import { CONVERSATION } from './agentGuide.js';
import { connectContactsStep } from './network.js';

const PURPOSES: AgentSignupPurpose[] = ['account', 'network'];
/** The server's username rule: lower-case letters, digits and single hyphens, 2 to 28 characters. */
const USERNAME_RE = /^(?=.{2,28}$)[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** --purpose and the --agent-* flags, or a usage problem. Checked before any code is requested. */
export function networkSignupFields(opts: LoginOptions): { fields: AgentAuthVerifyFields } | { error: string } {
  const fields: AgentAuthVerifyFields = {};
  const purpose = opts.purpose?.trim().toLowerCase();
  if (purpose !== undefined && purpose !== '') {
    if (!PURPOSES.includes(purpose as AgentSignupPurpose)) {
      return { error: '--purpose is "account" (a full {{accountName}} account) or "network" (the {{accountName}} Network only).' };
    }
    fields.purpose = purpose as AgentSignupPurpose;
  }

  const agentGiven = [opts.agentUsername, opts.agentDisplayName, opts.agentProduct].some((v) => v?.trim());
  if (agentGiven) {
    const username = opts.agentUsername?.trim().toLowerCase();
    if (!username) return { error: '--agent-display-name and --agent-product need --agent-username.' };
    if (!USERNAME_RE.test(username)) {
      return { error: '--agent-username is 2 to 28 characters: lower-case letters, digits and single hyphens.' };
    }
    const agent: AgentSignupAgent = { username };
    if (opts.agentDisplayName?.trim()) agent.displayName = opts.agentDisplayName.trim();
    if (opts.agentProduct?.trim()) agent.product = opts.agentProduct.trim();
    fields.agent = agent;
  }
  if (fields.agent && !fields.purpose) {
    return { error: 'Signing up an agent needs --purpose: "account" (a full {{accountName}} account) or "network" (the {{accountName}} Network only).' };
  }
  if (fields.purpose === 'network' && !fields.agent) {
    return { error: '--purpose network registers the agent: give --agent-username too.' };
  }
  return { fields };
}

/** Guidance for the agent sign-up refusals, or undefined for any other. `again` is "run the same command with --code X". */
export function networkVerifyHint(err: AgntApiError, again: string): string | undefined {
  switch (err.errorCode) {
    case 'purpose_required':
    case 'invalid_purpose':
      return `This app needs --purpose: "account" (a full {{accountName}} account) or "network" (the {{accountName}} Network only). Your code is still good: ${again} --purpose <account|network>.`;
    case 'agnt_not_enabled':
      // Refused before the code is read: nothing was created, and the code still works.
      return "The {{accountName}} Network isn't turned on for this app yet; only its operator can turn it on. Stop and tell your user; nothing you run can fix it.";
    case 'purpose_not_supported':
      return `This app does not take that purpose yet. Your code is still good: ${again} --purpose account.`;
    case 'agent_required':
      return `--purpose network registers the agent, so it needs --agent-username. Your code is still good: ${again} --agent-username <name>.`;
    case 'invalid_username':
      return `--agent-username is 2 to 28 characters: lower-case letters, digits and single hyphens. Your code is still good: ${again} and another name.`;
    case 'agnt_username_reserved':
      return `That username is reserved. Your code is still good: ${again} and another --agent-username.`;
    case 'agnt_username_taken':
      // The same code covers both cases; the server's message says which.
      return /new code/i.test(err.message)
        ? 'The username was taken after your code was used. Choose another --agent-username and run without --code to email a new code, then ask your user for it in your conversation.'
        : `That username is taken. Your code is still good: ${again} and another --agent-username.`;
    case 'invalid_agent':
      return `Fix the flag the message names. Your code is still good: ${again}.`;
    case 'agnt_unavailable_code_kept':
      return `Agent sign-up is unavailable just now, and your code is still good. Wait a few minutes, then ${again}.`;
    case 'agnt_unavailable_new_code':
      return 'Agent sign-up is unavailable just now, and your code was used. Wait a few minutes, then run the same command without --code to email a new one, and ask your user for it.';
    case 'agnt_unavailable':
      // A server that does not say which: try the same code first.
      return `Agent sign-up is unavailable just now. Wait a few minutes, then ${again}; if the code is refused then, run without --code to email a new one.`;
  }
  return undefined;
}

/**
 * What login says once a sign-up gave the agent its {{accountName}} Network ID; undefined when it gave none.
 * `profileFlag` always names the saved profile: the network commands never fall back to the default one.
 */
export function networkConnected(result: AgentAuthVerifyResult, profileFlag: string):
  { tellUser: string; next: string[]; lines: string[]; extra: Record<string, unknown> } | undefined {
  const agnt = result.agnt;
  if (!agnt) return undefined;
  const where = result.purpose === 'network'
    ? "You're registered on the {{accountName}} Network."
    : `Your {{accountName}} account is ready.`;
  const tellUser = `${where} Your agent's {{accountName}} Network ID is ${agnt.address}: other agents can message it there. ` +
    `{{accountName}} holds the agent's keys.`;
  const next = [
    `{{accountSlug}} network whoami${profileFlag}`,
    `{{accountSlug}} network send${profileFlag} --to <their Network ID> --subject "..." --text "..."`,
    `{{accountSlug}} network wait${profileFlag}`,
  ];
  const lines: string[] = [];
  // The person's own next step: bring their contacts in (links they open themselves).
  const connect = connectContactsStep(result.connectContactsUrl);
  if (connect) lines.push(`Ask your user: ${connect.askUser}`);
  return { tellUser, next, lines, extra: { conversation: CONVERSATION, ...(connect ? { connectContacts: connect } : {}) } };
}
