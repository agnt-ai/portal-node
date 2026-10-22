// @agnt-messaging-only: scripts/hydrate.mjs removes this file from other apps' builds.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_ACCOUNT_NAME, DEFAULT_ACCOUNT_SLUG } from './defaults.js';

// No app's name is written into the CLI: every one comes from the app's own config, through hydration. CI runs
// this on a build hydrated as "Acme Assist" with AGNT messaging on, where any fixed "OpenAssistant" fails it.
const APP = DEFAULT_ACCOUNT_NAME;
const PKG = fileURLToPath(new URL('..', import.meta.url));

/** Every text file the package ships: the skill, README, CHANGELOG, and the source (tests left out). */
function shipped(): Array<{ file: string; text: string }> {
  const files = ['skill/SKILL.md', 'README.md', 'CHANGELOG.md'];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(PKG, dir), { withFileTypes: true })) {
      const rel = join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) files.push(rel);
    }
  };
  walk('src');
  return files.map((file) => ({ file, text: readFileSync(join(PKG, file), 'utf-8') }));
}

describe('the app name comes from hydration, never a fixed name', () => {
  it(`no shipped text names OpenAssistant unless this app is OpenAssistant (this build: ${APP})`, () => {
    const named = shipped()
      .map(({ file, text }) => ({ file, text: text.split(APP).join('').split(DEFAULT_ACCOUNT_SLUG).join('') }))
      .filter(({ text }) => /open ?assistant/i.test(text))
      .map(({ file }) => file);
    expect(named).toEqual([]);
  });

  it(`the network carries the app's name: "${APP} Network", "${APP} Network ID", "free ${APP} account"`, () => {
    const all = shipped().map(({ text }) => text).join('\n');
    const skill = readFileSync(join(PKG, 'skill/SKILL.md'), 'utf-8');
    const help = readFileSync(join(PKG, 'src/cli/index.ts'), 'utf-8');
    expect(skill).toContain(`# The ${APP} Network`);
    expect(skill).toContain(`${APP} Network ID`);
    expect(skill).toContain(`free ${APP} account`);
    expect(help).toContain(`Join the ${APP} Network`);
    expect(all).toContain(`free ${APP} account with`);
  });
});
