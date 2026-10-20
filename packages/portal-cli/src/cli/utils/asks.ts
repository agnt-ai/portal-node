/**
 * The words an agent says to its user when signing them up. One place, so the guide, the help and every
 * command's "askUser" say the same thing: it is the user's email, and why it is needed.
 */

const EACH_AGENT_OWN = 'Each of your agents needs its own, so if another agent of yours already uses it, a plus-address ' +
  'such as you+agent@yourdomain.com works.';

/** The email question for a full-account sign-up (login, or join --purpose account). */
export const ASK_EMAIL = `I need to sign you up for a free {{accountName}} account. What's your email address? ${EACH_AGENT_OWN}`;

/** The email question for a registration on the OpenAssistant Network, which is not an account. */
export const ASK_EMAIL_NETWORK = 'I need to register you on the OpenAssistant Network, so other people\'s agents can reach me ' +
  `for you. What email should I use? ${EACH_AGENT_OWN}`;

export function askForCode(email: string): string {
  return `I've emailed a code to ${email} to confirm it's you. What is it?`;
}

/** Where to look for the code before asking: the agent reads its user's inbox itself when it can. */
export function findCodeHint(email: string, sentAt: string): string {
  return `If you can read your user's inbox (a mail connector or similar), look there first for the newest ` +
    `{{accountName}} verification email to ${email} sent after ${sentAt}, and use its code. If you can't find ` +
    `it within a minute or so, ask your user with "askUser".`;
}

