/**
 * Tells whoever runs this CLI when a newer copy exists, the way an app tells you it can be updated.
 *
 * The rules, all of them load-bearing:
 *  - The source of truth is the npm registry's `latest` for this package. Only the NUMBERS in its `version` are used: they are
 *    compared, and the notice is built from our own text (with the CLI's own INSTALL_COMMAND) and the two version
 *    numbers re-assembled from integers. No other string from the registry reaches the output, because the only install command an agent may
 *    trust is the one this CLI prints (no URL, release note or "install this" text can ride in on a registry answer).
 *  - It never blocks, slows or breaks a command. The check runs at most once every 24 hours; its answer is a small state file
 *    next to the credentials; the request is not waited for (it does not keep the process alive, and gives up after
 *    FETCH_TIMEOUT_MS), so the notice appears on the next run after the answer arrived. Every failure is silent.
 *    The one command that waits (up to that timeout) is an explicit `--version`: asking which version this is also asks whether it is current.
 *  - The notice is on STDERR only, at most once a day while the copy is out of date (always on `--version`). stdout, which
 *    agents parse as JSON, and every exit status are untouched.
 *  - Off with NETWORK_NO_UPDATE_CHECK=1 (or the common NO_UPDATE_NOTIFIER). Not switched off by CI: a clean CI machine has no state
 *    file, so it prints nothing and costs one background request at most, while agent harnesses often set CI.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { apiUrlProblem, isHydrated } from '../../defaults.js';
import { UPDATE_NOTICE_NOTE } from '../commands/agentGuide.js';

/** The variable that turns the check and the notice off. */
export const UPDATE_CHECK_OFF_ENV = 'NETWORK_NO_UPDATE_CHECK';
/** The variable that points the check at another registry document (a mirror, or a test); https, or http on this computer. */
export const UPDATE_CHECK_URL_ENV = 'NETWORK_UPDATE_CHECK_URL';

const PACKAGE_NAME = '@agnt-sdk/{{accountSlug}}';
const COMMAND_NAME = '{{accountSlug}}';
const ACCOUNT_DIR = '.{{accountSlug}}';
const STATE_FILE = 'update-check.json';

export const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;
export const FETCH_TIMEOUT_MS = 1500;
const MAX_BODY_BYTES = 256 * 1024;

export type Version = readonly [number, number, number];

/** A plain release number (major.minor.patch, each at most six digits); anything else (a tag, a range, text) is not a version. */
export function parseVersion(value: unknown): Version | undefined {
  const m = typeof value === 'string' ? /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/.exec(value) : null;
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined;
}

/** The running copy's number: a pre-release suffix (0.3.0-beta.1) counts as its release. */
function parseCurrent(value: string): Version | undefined {
  return parseVersion(/^(\d+\.\d+\.\d+)/.exec(value)?.[1]);
}

export function isNewer(latest: Version, current: Version): boolean {
  for (let i = 0; i < 3; i++) if (latest[i] !== current[i]) return latest[i] > current[i];
  return false;
}

const show = (v: Version): string => v.join('.');

/** The two-line notice: our words and our command, with the numbers re-assembled from integers. */
export function noticeText(command: string, current: Version, latest: Version): string {
  return `${command}: update available (installed ${show(current)}, latest ${show(latest)}).\n${UPDATE_NOTICE_NOTE}\n`;
}

interface State {
  /** When the registry was last asked, success or not (ms). */
  checkedAt?: number;
  /** The latest release it named (a validated release number). */
  latest?: string;
  /** When the notice was last shown (ms). */
  noticeAt?: number;
}

export interface UpdateCheckDeps {
  env: NodeJS.ProcessEnv;
  now: () => number;
  statePath: string;
  registryUrl: string;
  command: string;
  /** Resolves the parsed JSON body of a GET, or rejects (timeout, status, size, bad JSON). */
  getJson: (url: string, timeoutMs: number) => Promise<unknown>;
  /** Writes to stderr. */
  warn: (text: string) => void;
}

function readState(path: string): State {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
    return {
      checkedAt: num(raw?.checkedAt),
      latest: parseVersion(raw?.latest) ? raw.latest : undefined,
      noticeAt: num(raw?.noticeAt),
    };
  } catch {
    return {};
  }
}

function writeState(path: string, state: State): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}`;
    writeFileSync(tmp, JSON.stringify(state) + '\n', 'utf8');
    renameSync(tmp, path);
  } catch {
    /* an unwritable directory just means the check runs again next time */
  }
}

/** GET a small JSON document. The request never keeps the process alive. */
function getJson(url: string, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let target: URL;
    try {
      target = new URL(url);
    } catch (err) {
      reject(err);
      return;
    }
    const transport = target.protocol === 'https:' ? https : http;
    const req = transport.get(target, { agent: false, headers: { accept: 'application/json' } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`status ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          req.destroy(new Error('too large'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (err) {
          reject(err);
        }
      });
      res.on('error', reject);
    });
    req.on('socket', (socket) => socket.unref());
    req.on('error', reject);
    const timer = setTimeout(() => req.destroy(new Error('timeout')), timeoutMs);
    timer.unref();
    req.on('close', () => clearTimeout(timer));
  });
}

/** The real dependencies, or undefined for a build that was never hydrated with an account (a local dev build). */
export function defaultUpdateCheckDeps(env: NodeJS.ProcessEnv = process.env): UpdateCheckDeps | undefined {
  if (!isHydrated(COMMAND_NAME)) return undefined;
  const override = env[UPDATE_CHECK_URL_ENV]?.trim();
  const registryUrl = override && !apiUrlProblem(override) ? override : `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
  return {
    env,
    now: () => Date.now(),
    statePath: join(homedir(), ACCOUNT_DIR, STATE_FILE),
    registryUrl,
    command: COMMAND_NAME,
    getJson,
    warn: (text) => {
      try {
        process.stderr.write(text);
      } catch {
        /* a closed stderr must not break the command */
      }
    },
  };
}

const truthy = (v: string | undefined): boolean => !!v && !['0', 'false', 'no', 'off'].includes(v.trim().toLowerCase());

export function updateCheckDisabled(env: NodeJS.ProcessEnv): boolean {
  return truthy(env[UPDATE_CHECK_OFF_ENV]) || truthy(env.NO_UPDATE_NOTIFIER);
}

/** Asks the registry and keeps the answer; never rejects. A failed ask is kept too, so an offline machine asks once a day, not on every command. */
async function refresh(deps: UpdateCheckDeps): Promise<void> {
  let latest: string | undefined;
  try {
    const body = (await deps.getJson(deps.registryUrl, FETCH_TIMEOUT_MS)) as { version?: unknown } | null;
    latest = parseVersion(body?.version) ? (body!.version as string) : undefined;
  } catch {
    /* offline, slow, refused, not JSON: nothing to say */
  }
  const state = readState(deps.statePath); // read again: another command may have written meanwhile
  writeState(deps.statePath, { ...state, checkedAt: deps.now(), latest: latest ?? state.latest });
}

/**
 * Called once, first thing. Shows the notice from what an earlier run learned, and starts the daily refresh in the background.
 * `args` are the command line arguments after the program name. Never rejects, never throws, never writes stdout.
 */
export async function startUpdateCheck(args: readonly string[], currentVersion: string, deps = defaultUpdateCheckDeps()): Promise<void> {
  try {
    if (!deps || updateCheckDisabled(deps.env)) return;
    const current = parseCurrent(currentVersion);
    if (!current) return;
    const asked = args.includes('--version') || args.includes('-V');
    const now = deps.now();
    const first = readState(deps.statePath);
    const due = first.checkedAt === undefined || now - first.checkedAt >= CHECK_EVERY_MS || first.checkedAt > now;
    const refreshing = due ? refresh(deps) : undefined;
    if (asked) await refreshing; // only `--version` waits (at most FETCH_TIMEOUT_MS): it is how you ask what you have
    const state = asked ? readState(deps.statePath) : first;
    const latest = parseVersion(state.latest);
    if (latest && isNewer(latest, current) && (asked || state.noticeAt === undefined || now - state.noticeAt >= CHECK_EVERY_MS || state.noticeAt > now)) {
      deps.warn(noticeText(deps.command, current, latest));
      writeState(deps.statePath, { ...readState(deps.statePath), noticeAt: now });
    }
  } catch {
    /* never let the check touch the command */
  }
}
