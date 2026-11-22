# Telemetry

With telemetry on, a self-hosted instance sends one snapshot of itself a day. It tells the
upstream project which versions are still running, which features get used, and where
deliveries fail on machines nobody reports from.

Telemetry is off by default. The worker sends nothing unless `TELEMETRY_DISABLED=0` is set.
Everything it sends when it is on is listed below.

## When it is sent

The first snapshot goes out when the worker starts, so an instance that is set up and
removed the same hour is still counted once. After that each instance picks one minute
of the day at random and keeps it, then reports once a day from that minute on. That
spreads the traffic instead of every instance reporting at midnight UTC.

A send that fails is retried with a growing delay for five attempts, then once an hour.
The worker logs each failure and carries on with its other work.

## Turning it on or off

Set this in `.env` to turn it on:

```bash
TELEMETRY_DISABLED=0
```

Unset, empty or any other value keeps it off, and no instance id is generated.
`DO_NOT_TRACK` set to any non-empty value but `0` keeps it off even then. With the Helm chart,
set `api.env.TELEMETRY_DISABLED` and `worker.env.DO_NOT_TRACK` to `"0"`. Both are strings:
quote them in a values file, or pass them with `--set-string`.

## Seeing what is sent

```bash
TELEMETRY_DEBUG=1
```

The worker logs the exact body before each send. With Helm, set `worker.env.TELEMETRY_DEBUG` to
`"1"`.

## What is sent

- A random id, generated once for this instance.
- The day the instance was installed, taken from the timestamp of its first database
  migration.
- The running version.
- The build: which edition the images come from, `community` or `pro`. Not whether a
  license is active, and nothing from the license.
- The runtime: Bun version, OS and architecture, Postgres major version, whether it
  runs in Docker.
- How many users, projects and issues there are, plus how many people used the instance
  and how many issues were created in the last 30 days, and how much space attachments
  take. All of it as size ranges (`6-20`, `101-1000`).
- Usage, as exact numbers:
  - people who used it in the last 24 hours, 7 days and 30 days;
  - teams and projects with any change in the last 24 hours;
  - internal and external agents that ran in the last 24 hours, and runs per trigger;
  - issues closed in the last 24 hours, with and without an agent delegate;
  - projects imported in the last 24 hours, per source (`linear`, `trello`).
- Which features are used, as yes/no, twice over: ever, and in the last 30 days.
  Initiatives, note boards, dashboards, saved views, custom fields, label groups,
  project actions, attachments, cycles, checklists, sub-issues, issue links, watchers,
  shared issues, shared views, agent chats, agent skills.
- Which optional sections a project switched off in Settings -> Features, as yes/no.
- Which integrations are set up and switched on, as yes/no: email, Google sign-in,
  Telegram bot, webhooks, API keys, MCP, repository hosting, per-project integration
  credentials.
- Which integrations hold a credential, by their catalogue key (`openai`, `jina`), and
  which repository hosts have delivered (`github`, `gitlab`, `gitea`, `forgejo`,
  `bitbucket`). The keys only, never a credential or a repository name.
- The sign-up policy: whether registration is open, invite-only or closed, whether
  email has to be confirmed, whether magic links are on.
- The interface languages users picked, as language codes.
- AI agents: how many, how many are internal and how many external, how many runs in
  the last 30 days (as ranges), how many skills, how many chats, whether schedules are
  used, whether an external agent's runner polled in the last 30 days, and which
  triggers started a run (mention, delegation, schedule, manual).
- The share of webhook deliveries and of agent runs that failed in the last 30 days.

## What is never sent

Names of anything. Project keys, issue titles, descriptions, comments. Email
addresses, user names. Webhook URLs, agent prompts, credentials, environment
variables, file contents, logs, error messages. Exact counts of users, projects and
issues.

The instance id is a random uuid stored in the database. It is not derived from your
domain, your keys, or anything else in the instance.

## Where it goes

`https://telemetry.itsaplan.dev`, operated by the upstream project,
[croffasia/itsaplan](https://github.com/croffasia/itsaplan). No third-party analytics
service is involved. The address is fixed in the worker; there is no setting that
points it somewhere else.
