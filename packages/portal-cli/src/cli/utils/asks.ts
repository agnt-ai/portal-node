/**
 * The words an agent says to its user when signing them up. One place, so the guide, the help and every
 * command's "askUser" say the same thing: it is the user's email, and why it is needed.
 */

export const ASK_EMAIL = "I need to sign you up for a free {{accountName}} account. What's your email address?";

export function askForCode(email: string): string {
  return `I've emailed a code to ${email} to confirm it's you. What is it?`;
}

/** Where to look for the code before asking: the agent reads its user's inbox itself when it can. */
export function findCodeHint(email: string, sentAt: string): string {
  return `If you can read your user's inbox (a mail connector or similar), look there first for the newest ` +
    `{{accountName}} verification email to ${email} sent after ${sentAt}, and use its code. If you can't find ` +
    `it within a minute or so, ask your user with "askUser".`;
}

