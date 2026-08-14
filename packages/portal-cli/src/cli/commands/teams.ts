import { clientFor } from '../utils/api.js';

export interface TeamsListOptions {
  profile?: string;
  json?: boolean;
}

export async function runTeamsList(opts: TeamsListOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.teams.list();

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!result.teams.length) {
    console.log('No teams found.');
    return;
  }
  for (const team of result.teams) {
    console.log(`${team.id}  ${team.name}`);
  }
}

export interface TeamsGetOptions {
  profile?: string;
  json?: boolean;
}

export async function runTeamsGet(teamId: string, opts: TeamsGetOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const team = await client.teams.get(teamId);
  console.log(JSON.stringify(team, null, 2));
}

export interface TeamsCreateOptions {
  profile?: string;
  json?: boolean;
}

export async function runTeamsCreate(name: string, opts: TeamsCreateOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const team = await client.teams.create(name);

  if (opts.json) {
    console.log(JSON.stringify(team, null, 2));
    return;
  }
  console.log(`Created team ${team.id}: ${team.name}`);
}

export interface TeamsDeleteOptions {
  profile?: string;
}

export async function runTeamsDelete(teamId: string, opts: TeamsDeleteOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.teams.delete(teamId);
  console.log(`Deleted team ${teamId}.`);
}

export interface TeamsMembersOptions {
  profile?: string;
  json?: boolean;
}

export async function runTeamsMembers(teamId: string, opts: TeamsMembersOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.teams.listMembers(teamId);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!result.members.length) {
    console.log('No members found.');
    return;
  }
  for (const member of result.members) {
    console.log(`${member.id}  ${member.user}  [${member.role}]`);
  }
}

export interface TeamsAddMemberOptions {
  role?: 'owner' | 'admin' | 'member';
  profile?: string;
}

export async function runTeamsAddMember(teamId: string, userId: string, opts: TeamsAddMemberOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const member = await client.teams.addMember(teamId, userId, opts.role ?? 'member');
  console.log(`Added ${userId} to team ${teamId} as ${member.role}.`);
}

export interface TeamsRemoveMemberOptions {
  profile?: string;
}

export async function runTeamsRemoveMember(teamId: string, memberId: string, opts: TeamsRemoveMemberOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.teams.removeMember(teamId, memberId);
  console.log(`Removed member ${memberId} from team ${teamId}.`);
}
