import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * The compiled CLI's help, every command and subcommand: what a person or an agent reads never names the
 * platform's internal "agnt"/"AGNT" (an env var, an error code, an example address). API paths and the
 * server's own error codes in printed errors are not help, so they are not checked here.
 */

const cli = fileURLToPath(new URL('../../dist/cli/index.js', import.meta.url));
// The same commander the CLI loads, so patching its prototype reaches the CLI's program.
const commander = createRequire(cli).resolve('commander');

/** Every command's full help text, from one run of the compiled CLI with its parse replaced by a walk. */
function allHelp(): Array<{ name: string; help: string }> {
  const script = `
    const { Command } = await import(${JSON.stringify(pathToFileURL(commander).href)});
    Command.prototype.parseAsync = async function () {
      const out = [];
      const walk = (cmd, path) => {
        out.push({ name: path.join(' '), help: cmd.helpInformation() });
        for (const sub of cmd.commands) walk(sub, [...path, sub.name()]);
      };
      walk(this, [this.name()]);
      process.stdout.write(JSON.stringify(out));
      return this;
    };
    await import(${JSON.stringify(pathToFileURL(cli).href)});
  `;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  expect(run.status, run.stderr).toBe(0);
  return JSON.parse(run.stdout);
}

describe('help text', () => {
  const pages = allHelp();

  it('covers the whole command tree', () => {
    expect(pages.length).toBeGreaterThan(100);
    expect(pages.map((p) => p.name)).toEqual(expect.arrayContaining([
      expect.stringMatching(/ network inbox$/), expect.stringMatching(/ network join$/), expect.stringMatching(/ login$/),
    ]));
  });

  it('never says agnt or AGNT, outside URL paths', () => {
    for (const { name, help } of pages) {
      // A URL path like /agnt/... is an address, not a name; drop it before looking.
      const text = help.replace(/\/agnt\/[^\s'"`)]*/gi, '');
      expect({ name, found: text.match(/.{0,30}agnt.{0,30}/i)?.[0] }).toEqual({ name, found: undefined });
    }
  });

  it('names NETWORK_API_URL and NETWORK_CLI_PROFILE, and the history gap in plain words', () => {
    const page = (suffix: string) => pages.find((p) => p.name.endsWith(suffix))!.help;
    expect(page(' login')).toContain('NETWORK_API_URL');
    expect(page(' network join')).toContain('NETWORK_API_URL');
    expect(page(' configure')).toContain('NETWORK_API_URL');
    expect(page(' profiles list')).toContain('NETWORK_CLI_PROFILE');
    expect(page(' profiles use')).toContain('NETWORK_CLI_PROFILE');
    expect(page(' network inbox')).toMatch(/409 saying your message history has a\s+gap needs the app's operator/);
  });

  it('contacts bulk-import: the limit, the exit 2 refusal, network keys and the confirmation rule', () => {
    const page = (suffix: string) => pages.find((p) => p.name.endsWith(suffix))!.help;
    // Help wraps at the terminal's width: compare with every run of whitespace as one space.
    const bulk = page(' contacts bulk-import').replace(/\s+/g, ' ');
    expect(bulk).toContain('up to 1000 contacts at once from a JSON file');
    expect(bulk).toContain('nothing is sent and the command exits 2');
    expect(bulk).toContain('An agent signed in with a network key may import contacts for its own person only.');
    expect(bulk).toContain("an agent's import only fills that contact's empty fields, and never removes or overwrites what your person has");
    expect(bulk).not.toContain("updated with the file's fields");
    expect(bulk).toContain('By policy, they do not count as people your person knows until your person has confirmed them.');
    expect(bulk).toContain('ada@example.com');
  });

  it('network discovery: off by default, ask the person first, show | on | off', () => {
    const page = (suffix: string) => pages.find((p) => p.name.endsWith(suffix))!.help.replace(/\s+/g, ' ');
    expect(page(' network discovery')).toContain('It is off by default. You may turn it on for them, but ask your person first: it is their choice, and asking them is your job.');
    expect(page(' network discovery on')).toContain('Ask your person first: this is their choice.');
    expect(page(' network discovery off')).toContain('Do it when your person asks.');
    expect(page(' network discovery show')).toContain('--profile');
  });
});
