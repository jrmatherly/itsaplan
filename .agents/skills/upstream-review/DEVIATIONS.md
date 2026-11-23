# Deviations from upstream

Every place this fork differs from `croffasia/itsaplan` on purpose. A merge conflict in a path
listed here is resolved by its row. A conflict in a path not listed here is a deviation nobody
recorded: add the row first, then resolve.

Hunk rules used in Notes:

- **KEEP**: the file or line is ours. Keep our side.
- **ADAPT**: take upstream's change, then re-apply what the row says is ours.
- **ADOPT**: take upstream's side. Listed only where a reader might expect otherwise.
- **SKIP**: we do not carry the upstream change. Merge, then revert it in its own commit, and name
  the SHA here.

A new deviation gets a row in the same change that makes it. A removed path also gets a line under
"Deleted paths". The footprint is `upstream-review.sh --diverged`.

## Distribution and ownership (PR 4, `5945ce20`; PR 15)

| Upstream | Ours | Notes |
| --- | --- | --- |
| Community images `ghcr.io/croffasia/itsaplan-{api,worker,bot,web}` | `ghcr.io/jrmatherly/itsaplan-*` in `docker-compose.yml`, `docker-compose.coolify-images.yml`, `charts/itsaplan/values.yaml` and `charts/itsaplan/README.md`. `publish-images.yml` takes the owner from `github.repository`, and `docker-compose.coolify.yml` builds from source. | ADAPT. An upstream hunk that adds or renames a community image keeps the service change and takes our registry owner. |
| Chart published to and installed from `oci://ghcr.io/croffasia/charts` | `oci://ghcr.io/jrmatherly/charts`; `Chart.yaml` has `home` and `sources` naming the fork | ADAPT in `docs/helm.md` and the comment in `publish-chart.yml`. |
| Update feed `https://github.com/croffasia/itsaplan/releases.atom` | the fork's feed, in `apps/api/src/modules/settings/updates.ts` | KEEP the URL. The instance reports the fork's releases, so the fork's versions must be the ones it compares. |
| Repository links, clone URL, Discussions and advisory links name `croffasia/itsaplan` | name `jrmatherly/itsaplan` in `README.md`, `SECURITY.md`, `docs/development.md`, `docs/self-hosting.md`, `docs/coolify.md`, `docs/runner.md`, `docs/agent-endpoint.md`, `charts/itsaplan/README.md`, `.github/ISSUE_TEMPLATE/config.yml`, `.github/CODEOWNERS` and the `TODO(jrmatherly)` owner in `.github/workflows/ci.yml` | ADAPT. A new upstream link to its own repository becomes ours unless it points at something only upstream has (next table). |
| `README.md` opens with the product; Trendshift badges and a Product Hunt link | a fork notice at the top that names what upstream runs; no Trendshift or Product Hunt (PR 6, `e03a41ef`) | ADAPT. Feature-list hunks are ADOPT. A returning badge is dropped again. |
| Docs recommend upstream's own services: "Railway — recommended" in `README.md`, "Pro (recommended)" in `docs/coolify.md`, and `SECURITY.md` sends dependency findings "upstream" | The Railway heading has no "recommended" and says upstream runs the template; `docs/coolify.md` says "Pro (upstream images)"; the commercial-licence paragraph in `README.md` names upstream as the licensor; `SECURITY.md` says "that dependency's project" | KEEP the wording. |
| Conduct reports go to `conduct@itsaplan.dev` | go to the fork owner on GitHub, in `CODE_OF_CONDUCT.md` | KEEP. |
| Contributor licence agreement | none | See "Deleted paths". `CONTRIBUTING.md` has no CLA section: KEEP. |
| `packages/runner/README.md` links to upstream's `docs/runner.md` by absolute URL | a relative link to `docs/runner.md` | KEEP. The fork does not publish the package, so the README is read on GitHub and in clones. |
| `charts/itsaplan/values-pro.yaml` sets no image tag, so the Pro images take the chart's `appVersion` | `tag: "1.12.0"` on each Pro image, upstream's Pro release. `docs/helm.md`, `charts/itsaplan/README.md` and `docs/self-hosting.md` say the Pro tag is upstream's and when an instance may move to Pro | KEEP the tag: the chart's `appVersion` is the fork's version, which upstream does not publish a Pro image for. Raise it to upstream's Pro release when a merge brings one in. The repositories stay on upstream (next table). |

## Deliberately left on upstream

These name upstream on purpose. An upstream change to them is ADOPT.

| Path or value | Why it stays |
| --- | --- |
| Pro images `ghcr.io/croffasia/itsaplan-pro-*` in `docker-compose.pro.yml`, `docker-compose.coolify-pro.yml` and `charts/itsaplan/values-pro.yaml` | The Pro build is upstream's product and the fork does not build it. |
| `packages/runner` npm name, repository and author metadata | The package is published to npm by upstream. |
| Copyright lines and `LICENSE` files | They state who holds the copyright. |
| `itsaplan.dev` links in `apps/web/src/utils/app.ts` and `apps/api/src/modules/project-templates/publish.ts` | They point at upstream's site and template gallery. |
| The telemetry collector address | The collector is upstream's. The fork changes only whether the worker sends to it. |

## Telemetry (PR 4, `5945ce20`)

| Upstream | Ours | Notes |
| --- | --- | --- |
| The worker sends telemetry unless `TELEMETRY_DISABLED` is set to a value other than `0` | The worker sends nothing unless `TELEMETRY_DISABLED=0`: `apps/worker/src/telemetry.ts`, `apps/worker/src/telemetry-schedule.ts` | KEEP the switch logic. ADAPT any upstream change to what is sent. Pinned by `apps/worker/src/__tests__/integration/telemetry-switch.test.ts` and `apps/worker/src/__tests__/unit/telemetry-schedule.test.ts`. |
| Compose files and `.env.example` describe opt-out | describe opt-in and default it off; the chart has no `worker.env.TELEMETRY_DISABLED` | KEEP in the five compose files, `.env.example`, `charts/itsaplan/values.yaml`, the telemetry rows of the values table in `charts/itsaplan/README.md`, `TELEMETRY.md`, and "the telemetry switch" in `docs/coolify.md` and `docs/self-hosting.md`. `TELEMETRY.md` and the worker's log line say the collector is run by the upstream project: KEEP. |

## CI, releases and dependency updates (PR 4, `5945ce20`; PR 6, `e03a41ef`; PR 11; PR 13; PR 15; PR 16)

| Upstream | Ours | Notes |
| --- | --- | --- |
| Actions referenced by tag (`actions/checkout@v7`) | Every action pinned to a commit SHA with the tag as a comment; every step has a name | ADAPT in every file under `.github/workflows/`. Take upstream's job or step change, then pin and name it. Renovate keeps the pins current. |
| A checkout keeps the workflow token in `.git/config` | `persist-credentials: false` on every checkout but the one in `release.yml` that pushes the `release` branch | ADAPT in every file under `.github/workflows/`. A checkout upstream adds gets the line unless a later step pushes. |
| `publish-chart.yml` expands `secrets.GITHUB_TOKEN` and `github.actor` inside the login script | the login step reads both from `env` | KEEP ours. |
| CodeQL scans `javascript-typescript` | also scans `actions`, in the same `init` step | KEEP ours. The job stays one job named `Analyze`: the ruleset on `main` requires that name, so do not take a language matrix. |
| `docs/dev/releasing.md` has no section on tag and action settings | a section "Other repository settings": the tag and `release` branch rulesets, immutable releases, required SHA pinning, branch deletion on merge | KEEP the section. |
| The chart job uses the runner image's Helm | `publish-chart.yml` installs a pinned Helm 4 (`HELM_VERSION`) | KEEP. `docs/helm.md` and `charts/itsaplan/README.md` state Helm 4: KEEP. |
| no `renovate.json` | `renovate.json`, scoped to the action pins and `HELM_VERSION` | KEEP (fork-only file). npm packages, base images, runner images and Bun are out of its scope on purpose. |
| Bun 1.4.4 | 1.4.5 in `package.json`, the four Dockerfiles, `ci.yml` and `docs/development.md` | ADOPT upstream's next Bun bump when it is newer, in all seven places. Remove this row when upstream reaches 1.4.5. |
| `docs/dev/releasing.md` has no section on branch rules | a section "Rules on `main`": the fork's ruleset (a GitHub setting, not a file) requires a pull request and five checks, and the release PR needs its workflow runs approved | KEEP the section. Upstream has its own ruleset, which a fork does not inherit. |
| `docs/dev/releasing.md` has no steps for the release PR | a section "Before merging the release PR": an Updating note, upstream's pull request links, entries from merge commits | KEEP the section. Upstream's release carries no commits from another repository. |
| `release-please-config.json` updates `Chart.yaml` | also updates the version block in `docs/helm.md` | ADAPT. |
| `docs/dev/releasing.md` has no note on registry visibility | a bullet says each new GHCR package starts private and is set to public by hand | KEEP the bullet. |
| Version tokens and `CHANGELOG.md` follow upstream's releases | follow the fork's own release-please runs | KEEP ours in `package.json` `version`, `.release-please-manifest.json`, `charts/itsaplan/Chart.yaml` `version` and `appVersion`, the `docs/helm.md` version block and `CHANGELOG.md`. An upstream `chore: release main` commit is ADOPT for everything else it touches. |
| Tags `vX.Y.Z` name upstream's release commits | The fork cuts its own `vX.Y.Z` tags from its first release. From then on the same number names a different commit in each repository. | Never fetch upstream's tags (the driver sets `remote.upstream.tagOpt --no-tags`). Never dispatch the publish workflows for `v1.12.0`: that tag's chart names upstream's images. |

## Agent rules and their checks (PR 1, `f41815c7`; PR 7, `1de9700a`; PR 11)

| Upstream | Ours | Notes |
| --- | --- | --- |
| no `.claude/` settings | `.claude/settings.json` with deny rules for the no-exception rules | KEEP ours for `.claude/settings.json`, also when upstream adds a file at that path. Any other upstream file under `.claude/` is ADAPT: read it, port what is useful. |
| `scripts/agents-md.test.ts` checks size and paths | also checks each `AGENTS.md` has a `CLAUDE.md` holding `@AGENTS.md` | ADAPT. |
| The Dockerfile workspace rule is prose in `AGENTS.md` | `scripts/dockerfile-workspaces.test.ts` checks it; `AGENTS.md` has no such line | KEEP the test. If upstream edits that line, drop the hunk. |
| "Never `process.env.NEXT_PUBLIC_*` in a component" is prose in `apps/web/AGENTS.md` | a `no-restricted-syntax` rule in `apps/web/eslint.config.mjs`; `apps/web/AGENTS.md` has no such sentence | KEEP the rule. An upstream file that reads `process.env.NEXT_PUBLIC_*` fails the fork's lint: ADAPT it to `utils/runtimeEnv`. |
| `docs/dev/agents-md.md` | adds the deny-rule row, the row for a difference from upstream and the CI checks the fork runs; its "Good" example quotes the fork's Coolify rule | ADAPT. |
| `.agents/skills/tidy/SKILL.md` points at `.cursor/rules/` | no pointer: the repository tracks no `.cursor/rules/` | KEEP. |
| no `upstream-review` skill | `.agents/skills/upstream-review/`, `.upstream-review/`, and a rule in root `AGENTS.md` that points at this file | KEEP (fork-only). |
| `apps/web/AGENTS.md`: "One component per file, no exceptions. On finding a file with two, split it. File name = exported name, with the feature name as a PascalCase prefix." | "**One component per file.** File name = exported name." | KEEP ours if upstream edits the bullet. The code does not follow the prefix or the "no exceptions" clause. |
| `apps/api/AGENTS.md`: jsonb is validated "only as `t.Any()`"; a SCIM `project_member` row is refused "for edit or removal" | no `t.Any()` clause; refused "for a role change or removal" | KEEP. Several models validate jsonb with a schema, and the description route has no SCIM check. |
| `apps/worker/AGENTS.md`: leases and attempts come from the job settings | adds that imports read only their poll interval there | KEEP the added sentence. |
| `packages/auth/AGENTS.md`: switch to `sameSite: "none"` when frontend and backend are on different domains | keep `lax`: subdomains share the cookie and another registrable domain is not supported | KEEP. |
| Root `AGENTS.md`: "Never add `image:` to `docker-compose.coolify.yml`" | "to a service that has `build:`" | KEEP. Three services in that file have `image:` and no `build:`. |
| The cross-feature import rule is prose in `apps/web/AGENTS.md`, and the code has 15 exceptions to it | a `no-restricted-imports` rule in `apps/web/eslint.config.mjs` with an allowlist of those pairs; the `apps/web/AGENTS.md` bullet points at it | KEEP the rule. An upstream file that adds a pair fails the fork's lint: extend the allowlist in the merge PR. The rule sees static `@/` imports only. |

## Environment variables that reach the services (PR 10; PR 11)

| Upstream | Ours | Notes |
| --- | --- | --- |
| `.env.example` documents `PASSKEY_RP_ID`, `PASSKEY_RP_NAME` and `EMAIL_FROM`, no compose file or chart key passes them, and `packages/auth/src/index.ts` reads the two passkey ones with `??` | the five compose files pass all three to the api and `EMAIL_FROM` to the worker; the chart has `api.env.PASSKEY_RP_ID`, `api.env.PASSKEY_RP_NAME` and `api.env.EMAIL_FROM`; the two passkey reads use `\|\|` | ADAPT in the five compose files, `charts/itsaplan/templates/configmap.yaml`, `charts/itsaplan/values.yaml` and the values table in `charts/itsaplan/README.md`. KEEP the `\|\|` reads: compose passes an unset variable as an empty string, and `??` would make it the relying-party ID. `.env.example`, `docs/dev/auth.md` (Passkey) and `docs/self-hosting.md` (Mail, Updating) describe ours: ADAPT. |
| The chart has no key for `SSRF_ALLOWED_HOSTS`, `BACKUP_RETENTION_DAYS` or `TELEMETRY_DEBUG` | `api.env.SSRF_ALLOWED_HOSTS`, `api.env.BACKUP_RETENTION_DAYS` and `worker.env.TELEMETRY_DEBUG` | ADAPT in `charts/itsaplan/templates/configmap.yaml`, `charts/itsaplan/values.yaml` and the values table in `charts/itsaplan/README.md`. |

## Local tooling

| Upstream | Ours | Notes |
| --- | --- | --- |
| `.gitignore` | adds `.remember/`, `.codegraph/`, `/private/` | ADAPT. Keep both sides. |
| no `.serena/` | `.serena/project.yml`, `.serena/.gitignore` | KEEP (fork-only). |

## Plane import (PR 10; PR 14)

| Upstream | Ours | Notes |
| --- | --- | --- |
| `apps/worker/src/plane-adapter.ts` maps `blocking` and `blocked_by` both to `blocks` from the issue being read, and expects id strings in the relation lists | reads `blocking` only and accepts an id or a `{ project_id, issue_id }` entry | KEEP `listIssueRelations` and `RELATION_KIND_MAP`. Pinned by `apps/worker/src/__tests__/unit/plane-adapter.test.ts`. The relation passages of `docs/dev/plane-import-source-notes.md`, `docs/dev/plane-import.md` and `docs/importing-from-plane.md` follow it: KEEP. |
| `mapWorkItem` reads `cycle_id` or `cycle` from the work item, which Plane's response does not carry, so every imported issue has no cycle | `listCycleIssues` in `apps/worker/src/plane-adapter.ts` reads one page of a cycle's work items; `apps/worker/src/reader.ts` declares it as an optional `SourceReader` method; `runLink` in `apps/worker/src/import-worker.ts` reads one page per tick before its issue loop and calls `setIssueCycleIfUnset` in `apps/worker/src/import-store.ts` | KEEP all four. When upstream edits `runLink`, keep the cycle stage and its `LinkCursor` fields ahead of the issue loop, and keep `cyclesDone: true` in the cursor the loop saves. Pinned by the `listCycleIssues` cases in `apps/worker/src/__tests__/unit/plane-adapter.test.ts`, the cycle case of `runLink` in `apps/worker/src/__tests__/integration/import-rewrite.test.ts` and the cycle case of `runCreate` in `apps/worker/src/__tests__/integration/import-create.test.ts`. The cycle lines of `docs/importing-from-plane.md`, `docs/dev/plane-import.md` and `docs/dev/plane-import-source-notes.md` follow it: KEEP. |

## Import worker (PR 18)

| Upstream | Ours | Notes |
| --- | --- | --- |
| `storeAttachments` in `apps/worker/src/import-worker.ts` logs a rejected attachment's source id and message as they are | both lose their line breaks first | KEEP ours. It closes CodeQL alert `js/log-injection`. |

## Docs corrected against the code (PR 8, `920a9cfb`; PR 10; PR 11)

Each row is a statement upstream's doc gets wrong and the code proves otherwise. All are ADAPT:
take upstream's new content, keep our corrected fact. When upstream's hunk also changes the code
the fact rests on, check the fact against the new code before keeping either side.

| Upstream | Ours | Notes |
| --- | --- | --- |
| Import guides quote labels the app does not show: **Test connection**, "choose under Source", "Leave unassigned", "The source's rate limit was reached", an **Export** section | The labels in `apps/web/messages/en/settings.json`: **Connect**, the source tabs, **Import** and **Don't import**, "The source hit its request limit", the **Export as JSON** button | `docs/importing-from-{linear,plane,trello}.md`. Re-read the message file when upstream renames a label. |
| Import guides and notes describe behaviour the importers do not have: Plane states matched by name, an inline image as plain text, an existing match never overwritten, seven Trello list keywords, a Linear import that stops on the first error; the Plane notes call comments, re-runs, relations and Linear undecided | What `apps/worker/src/` does: states by Plane group, first assignee only, cycles need both dates, an image link to Plane, a reused label takes the source colour, the full keyword list, retries up to `MAX_ATTEMPTS` | The three guides, `docs/dev/plane-import-source-notes.md`. Also `docs/dev/plane-import.md` (the Trello routes, markdown custom fields in Rewrite) and `docs/dev/linear-import.md` (`resolveDownloadRedirects`). |
| MCP is enabled per project in Settings, MCP Server, and is off by default; an agent is created in the project's settings | MCP access and the project list are in the team's settings and a new project starts on; an agent is created in the team's settings and attached | `docs/runner.md`, `packages/runner/README.md`. The README also lists the `event` trigger, and `docs/runner.md` says catalog mode also lists an agent's configured tools. Also `apps/web/messages/*/teams.json` (13 languages), keys `runnerHelpMcp` and `runnerHelpMcpHint`: an upstream edit to either key takes our meaning. |
| The agent endpoint has no run events route; a stopped chat answer gets `canceled` from its result route; every MCP tool has an `outputSchema` | `POST /agent-runs/:runId/events`, `attempt` and `usage` on the run routes, `traceEvents`, what a stopped run returns, `canceled` from only the events and heartbeat routes of a stopped chat answer; an agent's configured tools have no `outputSchema` | `docs/agent-endpoint.md`, `docs/mcp-results.md`. Field names come from `apps/api/src/modules/agents/runner/model.ts`. |
| Four paths in `docs/dev/agents.md` lack the `modules/agents/` prefix | the full paths | `docs/dev/agents.md`. |
| The chart says the API cannot run behind a path prefix; the values table lacks `api.env.SKIP_PRE_MIGRATION_BACKUP`; a comment names `apiMode` and `apiHost` | A path in `API_URL` works when the proxy removes it; the row exists; the comment names `ingress.api.mode` and `ingress.api.host` | `charts/itsaplan/README.md`, `charts/itsaplan/values.yaml` (comments only). |
| Self-hosting docs say eight required values, a generated worker token, and passkey settings and worker tuning in `.env` | seven values, no worker token, background job tuning in god mode, and only the optional variables the compose file passes, which include the passkey and From variables | `docs/self-hosting.md`, `docs/coolify.md`, `docs/railway.md`. |
| `access-model.md` omits private Docs pages and Docs share links; `revision-engine.md` lists five scopes, says nothing in the application writes a counter and shows a `project_member`-only query; `scim.md` ends mid-sentence | the `documentVisibleTo` check and `/share/document/*`; the `documents` and `runnerQueue` scopes, `appendRunEvents`, what `readRevs` joins, the lock order of `packages/db/AGENTS.md`; the finished sentence | `docs/dev/access-model.md`, `docs/dev/revision-engine.md`, `docs/dev/scim.md`. |
| Contributor docs say four packages, web imports no package, no package builds, Bun 1.3+, `bun run dev` starts api and web, three generated secrets, `.env.test` for the api suite only | the ten packages, `@repo/editor` in web, `packages/runner` builds, Bun 1.4.5, four apps, two secrets, the four suites that read `.env.test` | `CONTRIBUTING.md`, `docs/development.md`. A Bun bump updates the version here. |
| `DESIGN.md` gives the dark border as `white / 10%`; `SECURITY.md` says "before its first stable release"; `TELEMETRY.md` gives no Helm note for `TELEMETRY_DEBUG` | `12%`; fixes ship in the next release; the Helm value `worker.env.TELEMETRY_DEBUG` | `DESIGN.md`, `SECURITY.md`, `TELEMETRY.md`. |

## Deleted paths

- `ICLA.md`, `.github/workflows/cla.yml` (PR 4, `5945ce20`): the agreement named upstream's owner
  as its only beneficiary. An upstream commit that touches either is SKIP, and the merge keeps the
  deletion.
