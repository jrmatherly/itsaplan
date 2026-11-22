import { describe, it, expect } from 'bun:test';
import { randomUUID } from 'node:crypto';
import {
  db,
  workspace,
  team,
  project,
  projectColumn,
  issue,
  issueLink,
  importJob,
  user,
} from '@repo/db';
import { eq } from 'drizzle-orm';
import {
  createLocalCycleAndRecord,
  createLocalInitiativeAndRecord,
  createLocalIssueAndRecord,
  getInitiativeDescription,
  type ClaimedImportJob,
} from '../../import-store';
import { runAttachments, runLink, runRewrite } from '../../import-worker';
import type { SourceReader } from '../../reader';

// Each test makes its own team, project and job, like import-store.test.ts. The job
// row is 'paused' so no other test's claimDueImportJobs picks it up; runRewrite is
// called directly with the job as the worker would have claimed it.

interface LinearJob {
  job: ClaimedImportJob;
  columnId: number;
  projectKey: string;
}

async function makeLinearJob(teamKey: string): Promise<LinearJob> {
  const [ws] = await db
    .insert(workspace)
    .values({ name: 'Importers' })
    .returning({ id: workspace.id });
  const [teamRow] = await db
    .insert(team)
    .values({ workspaceId: ws!.id, name: 'Importers' })
    .returning({ id: team.id });
  const projectKey = randomUUID().slice(0, 8);
  const [projectRow] = await db
    .insert(project)
    .values({ teamId: teamRow!.id, key: projectKey, name: 'Imported' })
    .returning({ id: project.id });
  const [columnRow] = await db
    .insert(projectColumn)
    .values({ projectId: projectRow!.id, name: 'Backlog', position: 1 })
    .returning({ id: projectColumn.id });
  const userId = randomUUID();
  await db.insert(user).values({ id: userId, name: 'Importer', email: `${userId}@example.test` });
  const config = { teamId: 'team-ato', teamKey, projectFilter: 'none', projectId: null };
  const [jobRow] = await db
    .insert(importJob)
    .values({
      projectId: projectRow!.id,
      createdByUserId: userId,
      source: 'linear',
      phase: 'rewrite',
      status: 'paused',
      config,
    })
    .returning({ id: importJob.id });
  return {
    job: {
      id: jobRow!.id,
      projectId: projectRow!.id,
      source: 'linear',
      phase: 'rewrite',
      status: 'paused',
      config,
      cursor: {},
      attempts: 0,
      credentialCiphertext: null,
      credentialIv: null,
      credentialAuthTag: null,
    },
    columnId: columnRow!.id,
    projectKey,
  };
}

async function importIssue(
  { job, columnId }: LinearJob,
  sourceId: string,
  number: number,
  description: string,
): Promise<number> {
  return createLocalIssueAndRecord(job.id, sourceId, String(number), {
    projectId: job.projectId,
    columnId,
    cycleId: null,
    parentId: null,
    assigneeUserId: null,
    title: `Issue ${number}`,
    description,
    priority: null,
    startDate: null,
    dueDate: null,
  });
}

async function issueRow(id: number) {
  const [row] = await db.select().from(issue).where(eq(issue.id, id));
  return row!;
}

describe('runRewrite', () => {
  it("rewrites a mention of another imported issue and keeps the issue's own Linear identifier", async () => {
    const linear = await makeLinearJob('ATO');
    const first = await importIssue(
      linear,
      'issue-505',
      505,
      'Needs ATO-506 first.\n\nImported from Linear: ATO-505',
    );
    const second = await importIssue(linear, 'issue-506', 506, 'Imported from Linear: ATO-506');

    await runRewrite(linear.job);

    const target = await issueRow(second);
    expect((await issueRow(first)).description).toBe(
      `Needs ${linear.projectKey}-${target.sequenceNumber} first.\n\nImported from Linear: ATO-505`,
    );
    expect(target.description).toBe('Imported from Linear: ATO-506');
  });

  it('leaves a mention of an issue that another job imported under the same team key', async () => {
    const other = await makeLinearJob('ATO');
    await importIssue(other, 'issue-12', 12, 'Imported from Linear: ATO-12');
    const linear = await makeLinearJob('ATO');
    const child = await importIssue(
      linear,
      'issue-505',
      505,
      'Parent in Linear: ATO-12\n\nImported from Linear: ATO-505',
    );

    await runRewrite(linear.job);

    expect((await issueRow(child)).description).toBe(
      'Parent in Linear: ATO-12\n\nImported from Linear: ATO-505',
    );
  });

  it('leaves the footer, a mention outside the job and a URL in the Links section alone', async () => {
    const linear = await makeLinearJob('ATO');
    const description = [
      'Blocked by ATO-999.',
      '',
      '## Links',
      '',
      '- [Spec](https://linear.app/acme/issue/ATO-506/the-spec)',
      '',
      'Imported from Linear: ATO-505',
    ].join('\n');
    const first = await importIssue(linear, 'issue-505', 505, description);
    await importIssue(linear, 'issue-506', 506, 'Imported from Linear: ATO-506');

    await runRewrite(linear.job);

    expect((await issueRow(first)).description).toBe(description);
  });
});

describe('runAttachments', () => {
  it('drops the file links of an initiative whose source lists no files for it', async () => {
    const { job } = await makeLinearJob('ATO');
    const initiativeId = await createLocalInitiativeAndRecord(
      job.id,
      {
        sourceId: 'initiative-1',
        title: 'Launch',
        descriptionMarkdown: 'See [spec.pdf](import-attachment:file-1)',
        status: 'active',
        ownerEmail: null,
        priority: null,
        startDate: null,
        targetDate: null,
        labelSourceIds: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      { projectId: job.projectId, ownerUserId: null, labelIds: [] },
    );
    const reader = { listIssueAttachments: async () => [] } as unknown as SourceReader;

    await runAttachments({ ...job, phase: 'attachments' }, reader);
    const [row] = await db
      .select({ cursor: importJob.cursor })
      .from(importJob)
      .where(eq(importJob.id, job.id));
    const cursor = row!.cursor as Record<string, unknown>;
    await runAttachments({ ...job, phase: 'attachments', cursor }, reader);

    expect(await getInitiativeDescription(initiativeId)).toBe('See spec.pdf');
  });
});

describe('runLink', () => {
  it('stores a relation from the issue that was read to its target, and skips a target that was not imported', async () => {
    const linear = await makeLinearJob('ATO');
    const blocker = await importIssue(linear, 'a', 1, '');
    const blocked = await importIssue(linear, 'b', 2, '');
    const reader = {
      getIssue: async () => ({ parentSourceId: null }),
      listIssueRelations: async (sourceId: string) =>
        sourceId === 'a'
          ? [
              { kind: 'blocks', sourceIssueSourceId: 'a', targetIssueSourceId: 'b' },
              { kind: 'blocks', sourceIssueSourceId: 'a', targetIssueSourceId: 'not-imported' },
            ]
          : [],
    } as unknown as SourceReader;

    await runLink({ ...linear.job, phase: 'link' }, reader);

    const links = await db
      .select({
        source: issueLink.sourceIssueId,
        target: issueLink.targetIssueId,
        kind: issueLink.kind,
      })
      .from(issueLink)
      .where(eq(issueLink.sourceIssueId, blocker));
    expect(links).toEqual([{ source: blocker, target: blocked, kind: 'blocks' }]);
  });

  it('sets the cycle of each imported issue its cycle lists, then runs the issue loop', async () => {
    const linear = await makeLinearJob('ATO');
    const a = await importIssue(linear, 'a', 1, '');
    const b = await importIssue(linear, 'b', 2, '');
    const cycleId = await createLocalCycleAndRecord(
      linear.job.id,
      'cycle-1',
      linear.job.projectId,
      {
        sourceId: 'cycle-1',
        name: 'Sprint 1',
        startDate: '2026-01-01',
        endDate: '2026-01-14',
      },
    );
    const pages: Record<string, { items: string[]; cursor: string | null }> = {
      first: { items: ['a'], cursor: 'p2' },
      p2: { items: ['never-imported'], cursor: null },
    };
    const reader = {
      listCycleIssues: async (_cycle: string, cursor: string | null) => pages[cursor ?? 'first']!,
      getIssue: async () => ({ parentSourceId: null }),
      listIssueRelations: async (sourceId: string) =>
        sourceId === 'a'
          ? [{ kind: 'blocks', sourceIssueSourceId: 'a', targetIssueSourceId: 'b' }]
          : [],
    } as unknown as SourceReader;
    const tick = async () => {
      const [row] = await db
        .select({ cursor: importJob.cursor })
        .from(importJob)
        .where(eq(importJob.id, linear.job.id));
      const cursor = row!.cursor as Record<string, unknown>;
      await runLink({ ...linear.job, phase: 'link', cursor }, reader);
    };

    await tick();
    await tick();
    await tick();
    const links = () => db.select().from(issueLink).where(eq(issueLink.sourceIssueId, a));
    expect(await links()).toEqual([]);
    const [stage] = await db
      .select({ cursor: importJob.cursor })
      .from(importJob)
      .where(eq(importJob.id, linear.job.id));
    expect(stage!.cursor).toMatchObject({ cyclesDone: true });
    await tick();

    expect((await issueRow(a)).cycleId).toBe(cycleId);
    expect((await issueRow(b)).cycleId).toBeNull();
    expect((await links()).map((link) => link.targetIssueId)).toEqual([b]);
  });
});
