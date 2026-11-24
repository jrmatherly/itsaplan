import { beforeEach, describe, expect, it } from 'bun:test';
import { db, notificationDelivery } from '@repo/db';
import { authedApi, createProject, type Api } from '#tests/helpers/app';
import { signUpTestUser } from '#tests/helpers/auth';
import { resetDb } from '#tests/helpers/db';

// Fork-owned: cases upstream's notification-preferences.test.ts leaves out. A separate file
// so an upstream merge never conflicts here.

const none = {
  assigned: false,
  mentioned: false,
  commented: false,
  state_changed: false,
  reacted: false,
};
const off = { emailEvents: none, telegramEvents: none, slackEvents: none, pushEvents: none };
const email = (...events: (keyof typeof none)[]) => ({
  ...off,
  emailEvents: { ...none, ...Object.fromEntries(events.map((event) => [event, true])) },
});

const account = (api: Api) => api.account['notification-preferences'];

async function setup() {
  const api = authedApi((await signUpTestUser()).cookie);
  const marketing = (await createProject(api, { key: 'MKT', name: 'Marketing' })).data!;
  const website = (await createProject(api, { key: 'WEB', name: 'Website' })).data!;
  return { api, marketingId: marketing.id, websiteId: website.id };
}

async function own(api: Api) {
  const { projects } = (await account(api).get()).data!;
  return Object.fromEntries(projects.map((p) => [p.name, p.preferences]));
}

beforeEach(resetDb);

describe('account notification preferences, fork cases', () => {
  it('change nothing when one of several projects is not the user’s', async () => {
    const { api, marketingId } = await setup();
    const other = authedApi((await signUpTestUser()).cookie);
    const theirs = (await createProject(other, { key: 'OTH', name: 'Other' })).data!;

    const res = await account(api).patch({
      defaults: email('assigned'),
      projects: [
        { projectId: marketingId, preferences: email('commented') },
        { projectId: theirs.id, preferences: email('commented') },
      ],
    });

    expect(res.status).toBe(403);
    expect((await account(api).get()).data!.defaults).toEqual(off);
    expect((await own(api)).Marketing).toBeNull();
    expect((await own(other)).Other).toBeNull();
  });

  it('reset every project before it writes the listed ones', async () => {
    const { api, marketingId, websiteId } = await setup();
    await account(api).patch({
      projects: [
        { projectId: marketingId, preferences: email('reacted') },
        { projectId: websiteId, preferences: email('reacted') },
      ],
    });

    const res = await account(api).patch({
      resetProjects: true,
      projects: [{ projectId: marketingId, preferences: email('commented') }],
    });

    expect(res.status).toBe(204);
    expect(await own(api)).toEqual({ Marketing: email('commented'), Website: null });
  });
});

describe('delivery, fork cases', () => {
  it('a project’s own settings do not reach another project', async () => {
    const { api, websiteId } = await setup();
    const member = await signUpTestUser();
    const memberApi = authedApi(member.cookie);
    const marketing = api.projects({ projectKey: 'MKT' });
    const invite = await marketing.invites.post({ email: member.email, role: 'member' });
    await memberApi.invites({ token: invite.data!.token }).accept.post();
    await api
      .projects({ projectKey: 'WEB' })
      .members.post({ userId: member.userId, role: 'member' });
    const view = (await marketing.get()).data!;
    await api.teams({ teamId: view.project.teamId })['notification-settings'].put({
      smtp: {
        enabled: true,
        host: 'smtp.example.com',
        port: 587,
        encryption: 'none',
        username: 'mailer@example.com',
        password: 'secret',
        timeout: null,
      },
    });
    await account(memberApi).patch({
      defaults: email('assigned'),
      projects: [{ projectId: websiteId, preferences: off }],
    });

    await marketing.issues.post({
      columnId: view.columns[0]!.id,
      title: 'Task',
      assigneeUserId: member.userId,
    });

    const rows = await db
      .select({ recipient: notificationDelivery.recipient })
      .from(notificationDelivery);
    expect(rows.map((row) => row.recipient)).toEqual([member.email]);
  });
});
