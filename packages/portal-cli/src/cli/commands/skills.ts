import { clientFor } from '../utils/api.js';

export interface SkillsListOptions {
  kind?: string;
  q?: string;
  profile?: string;
  json?: boolean;
}

export async function runSkillsList(opts: SkillsListOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const skills = await client.skills.list({ kind: opts.kind, q: opts.q });

  if (opts.json) {
    console.log(JSON.stringify(skills, null, 2));
    return;
  }
  if (!skills.length) {
    console.log('No skills found.');
    return;
  }
  for (const skill of skills) {
    console.log(`${skill.id}  ${skill.title ?? skill.name}  [${skill.kind}]`);
  }
}

export interface SkillsGetOptions {
  profile?: string;
  json?: boolean;
}

export async function runSkillsGet(skillId: string, opts: SkillsGetOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const skill = await client.skills.get(skillId);
  console.log(JSON.stringify(skill, null, 2));
}

export interface SkillsRunOptions {
  profile?: string;
  json?: boolean;
}

export async function runSkillsRunNow(skillId: string, opts: SkillsRunOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const task = await client.skills.runNow(skillId);

  if (opts.json) {
    console.log(JSON.stringify(task, null, 2));
    return;
  }
  console.log(`Started run — task ${task.id}.`);
}

export interface SkillsDeleteOptions {
  profile?: string;
}

export async function runSkillsDelete(skillId: string, opts: SkillsDeleteOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.skills.delete(skillId);
  console.log(`Deleted skill ${skillId}.`);
}
