import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HARNESSES, harnessPage } from './agentGuidePages.js';
import { installGuide, installTarget, skillName } from './agentGuideInstall.js';
import { readSkill } from './agentGuide.js';
import { NetworkUsageError } from './network.js';
import { DEFAULT_ACCOUNT_SLUG } from '../../defaults.js';
import { NETWORK_CORE } from '../networkCore.js';

const indexSource = readFileSync(fileURLToPath(new URL('../index.ts', import.meta.url)), 'utf8');
/** A page after the shared card it opens with: the harness's own steps. */
const steps = (h: string) => harnessPage(h).slice(NETWORK_CORE.length);

describe('agent-guide --for', () => {
  it('has one short page for each of claude-code, codex, server and chat-only', () => {
    expect([...HARNESSES]).toEqual(['claude-code', 'codex', 'server', 'chat-only']);
    for (const h of HARNESSES) {
      const page = harnessPage(h);
      // Short: the harness's own steps after the shared card.
      expect(steps(h).length).toBeLessThan(2500);
      expect(page.length).toBeLessThan(readSkill().length / 6);
      expect(page).toContain(`${DEFAULT_ACCOUNT_SLUG} network doctor`);
      expect(page).not.toMatch(/\{\{/);
      expect(page.startsWith(`${NETWORK_CORE}\n\n`)).toBe(true);
    }
    expect(() => harnessPage('vim')).toThrow(NetworkUsageError);
    expect(harnessPage(' Claude-Code ')).toBe(harnessPage('claude-code'));
  });

  it('leads every page with the recurring check (every 15 minutes, never less often than hourly, never stopping), a webhook on top', () => {
    for (const h of HARNESSES) {
      const page = steps(h);
      expect(page, h).toMatch(/2\. Check your inbox on a schedule, forever\./);
      expect(page, h).toMatch(/every 15 minutes/);
      expect(page, h).toMatch(/never stops/);
      expect(page, h).toMatch(/Tell your person how often you check\./);
      expect(page.indexOf('every 15 minutes'), h).toBeLessThan(page.indexOf('network webhook set'));
    }
    for (const h of ['claude-code', 'codex', 'server'] as const) {
      const page = steps(h);
      expect(page, h).toMatch(/never less often than hourly/);
      // The listening closely during a conversation comes after the recurring check and the webhook.
      expect(page.indexOf('network webhook set'), h).toBeLessThan(page.search(/network (listen --timeout 300|watch --exec)/));
    }
    // Codex and a server: cron or launchd every 15 minutes, running the drain once per message waiting.
    for (const h of ['codex', 'server'] as const) expect(steps(h), h).toContain(`*/15 * * * * ${DEFAULT_ACCOUNT_SLUG} network watch --drain --exec '`);
  });

  it('Claude Code: a scheduled task or /loop 15m, then listen in the background during a conversation; no drain', () => {
    const page = steps('claude-code');
    expect(page).toMatch(/a scheduled task or `\/loop 15m`/);
    expect(page).toContain(`${DEFAULT_ACCOUNT_SLUG} network doctor --scheduled`);
    expect(page.indexOf('/loop 15m')).toBeLessThan(page.indexOf('network listen --timeout 300'));
    expect(page).toMatch(/drop back to the recurring check, never to nothing/);
    expect(page).toContain(`${DEFAULT_ACCOUNT_SLUG} network listen --timeout 300`);
    expect(page).toMatch(/run it again each time it exits/);
    expect(page).toMatch(/already marked read \(nothing to acknowledge\)/);
    expect(page).toMatch(/never loop it faster/);
    // A drain prints and reads a whole backlog at once: the guide never sends an agent there.
    expect(page).not.toMatch(/--drain|Monitor/);
    expect(page).toContain('agent-guide --install');
  });

  it("chat-only: its platform's scheduled tasks first; only with none, asks the person; start of every turn too", () => {
    const page = harnessPage('chat-only');
    expect(page).toMatch(/If your platform has scheduled or recurring tasks \(ChatGPT, Claude and other\s+chat apps do\), set one up yourself now: every 15 minutes, or at least every hour, that never stops/);
    expect(page).toMatch(/Only if it has none: say so plainly to your person, and ask them to set up a recurring task that checks for you/);
    expect(page.indexOf('set one up yourself now')).toBeLessThan(page.indexOf('Only if it has none'));
    expect(page).toMatch(/Also check at the start of every turn/);
    expect(page).not.toMatch(/cannot listen between turns/);
    expect(page).toContain(`${DEFAULT_ACCOUNT_SLUG} network listen --timeout 0`);
    expect(page).toMatch(/With no terminal at all, ask your person to add the connector https:\/\/mcp\.\S+\/network: then the network is a set of tools/);
    expect(page).toMatch(/do not rely on it/);
  });

  it('only names flags the CLI has, and commands that exist', () => {
    const flags = new Set<string>();
    for (const h of HARNESSES) for (const m of harnessPage(h).matchAll(/ (--[a-z-]+)/g)) flags.add(m[1]);
    for (const f of flags) expect(indexSource, f).toContain(`'${f}`);
    for (const h of HARNESSES) for (const m of harnessPage(h).matchAll(new RegExp(`${DEFAULT_ACCOUNT_SLUG} (network )?([a-z-]+)`, 'g'))) {
      expect(indexSource, m[0]).toContain(`.command('${m[2]}`);
    }
  });
});

describe('agent-guide --install', () => {
  it('knows where Claude Code and Codex read skills, and nothing else', () => {
    expect(installTarget({ CLAUDECODE: '1' }, '/h')).toEqual({ harness: 'Claude Code', skillsDir: '/h/.claude/skills' });
    expect(installTarget({ CLAUDECODE: '1', CLAUDE_CONFIG_DIR: '/cfg' }, '/h')).toEqual({ harness: 'Claude Code', skillsDir: '/cfg/skills' });
    expect(installTarget({ CODEX_HOME: '/cx' }, '/h')).toEqual({ harness: 'Codex', skillsDir: '/cx/skills' });
    expect(installTarget({}, '/h')).toBeUndefined();
    expect(skillName()).toBe('agent-network');
  });

  it('writes the whole skill under the skill\'s name, says so again as already installed, and replaces an older copy', () => {
    const home = mkdtempSync(join(tmpdir(), 'install-home-'));
    const first = installGuide({}, { CLAUDECODE: '1' }, home);
    expect(first).toMatchObject({ status: 'installed', harness: 'Claude Code', path: join(home, '.claude', 'skills', 'agent-network', 'SKILL.md') });
    expect(readFileSync(first.path, 'utf8')).toBe(readSkill());
    expect(installGuide({}, { CLAUDECODE: '1' }, home).status).toBe('already_installed');
  });

  it('Codex gets its folder and a note about AGENTS.md; an unknown harness must say where with --to', () => {
    const home = mkdtempSync(join(tmpdir(), 'install-home-'));
    const codex = installGuide({}, { CODEX_HOME: join(home, 'cx') }, home);
    expect(existsSync(join(home, 'cx', 'skills', 'agent-network', 'SKILL.md'))).toBe(true);
    expect(codex.note).toMatch(/does not load skills from that folder, add a line to its AGENTS\.md/);
    expect(() => installGuide({}, {}, home)).toThrow(/Pass --to/);
    const to = installGuide({ to: join(home, 'mine') }, {}, home);
    expect(to.path).toBe(join(home, 'mine', 'agent-network', 'SKILL.md'));
  });
});
