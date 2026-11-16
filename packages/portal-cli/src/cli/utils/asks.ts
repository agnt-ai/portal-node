/**
 * The words an agent says to its user when signing them up. One place, so the guide, the help and every
 * command's "askUser" say the same thing: it is the user's email, and why it is needed.
 */

const EACH_AGENT_OWN = 'Each of your agents needs its own, so if another agent of yours already uses it, a plus-address ' +
  'such as you+agent@yourdomain.com works.';

/** The email question, for every sign-up: each one gives the person a free account. */
export const ASK_EMAIL = `I need to sign you up for a free {{accountName}} account. What's your email address? ${EACH_AGENT_OWN}`;

export function askForCode(email: string): string {
  return `I've emailed a code to ${email} to confirm it's you. What is it?`;
}

/** The code: asking the user is the default; reading their inbox is an option the agent says it took (2026-11-16). */
export function findCodeHint(email: string, sentAt: string): string {
  return `Asking your user for the code is the default. If you can read their inbox (a mail connector or similar), you may take it from there instead, and tell them you did: ` +
    `the newest {{accountName}} verification email to ${email} sent after ${sentAt}. Otherwise ask your user with "askUser".`;
}

