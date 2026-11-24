# Pull request 39 review fixes: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `packages/agent-tools` test suite independent of file order, and tell the user when a page's data fails to load.

**Architecture:** Task 1 adds one flag to one test script. Task 2 builds the `QueryCache` in a fork-owned file that holds the whole rule (which failed read is worth a toast, and which reads already show their own error), with a test that drives a real `QueryClient`; `providers.tsx` gains one option that calls it, so the edit to upstream's file is three lines. Task 3 records the deferred requirement on PLAN-4.

**Tech Stack:** Bun 1.4.5 test runner, `@tanstack/react-query` 5.104.2, sonner, next-intl.

**Spec:** `docs/superpowers/specs/2026-11-24-pr39-review-findings.md` (items 1, 2 and 3; items 4 to 7 are rejected there and have no task).

## Global Constraints

- Read `AGENTS.md`, `apps/web/AGENTS.md` and `.agents/skills/upstream-review/DEVIATIONS.md` before editing.
- Bun only. Run tasks from the repository root unless a step gives a directory.
- A deliberate edit to a file upstream also has gets a row in `DEVIATIONS.md` in the same change. Both edited files (`packages/agent-tools/package.json`, `apps/web/src/components/providers.tsx`) are identical to upstream at `57f06d14`.
- Minimum comments: a comment says why, is no longer than its code, and changes in the same edit as its code.
- No new dependency, no new environment variable, no new message key (the toast reuses `common.genericError` through the existing `errorMessage`).
- No edit to any upstream file other than the two named above. A read that needs to stay quiet is named in the fork-owned file, not marked in its own file.
- Never `git commit --no-verify`. Never commit or push without the owner's word.
- Each task is its own branch and pull request, squash-merged; the pull request title is the commit subject given in the task. Branches: `test/agent-tools-isolate`, `improvement/failed-read-toast`.
- Before proposing a commit, run `tidy`, `code-review` and `security-audit` on the new code, in that order (`AGENTS.md`, "When the work is done").
- Start from an up-to-date `main` and run `.agents/skills/upstream-review/scripts/upstream-review.sh --stat` first: if upstream changed either edited file, sync upstream before this plan.
- This host has no `.env.test`. The database suites run only in Docker (`docker compose -f docker-compose.test.yml build`, then `run --rm api-test`). Neither task needs them.
- In zsh an unquoted variable is not split into words: write loops with `seq` or `while read`.
- Each merged task opens or updates a release-please pull request (a patch version). Merging it is the owner's call.

## Review Focus

1. A read that already shows its own error (a link preview on hover, an attachment preview, an agent run trace). Expected: its own message and no toast. Test in Task 2, step 1; the list is built in step 3.
2. A background refetch fails while the page already shows data. Expected: no toast; the page keeps its data. Test in Task 2, step 1.
3. A read answers 401, 403 or 404. Expected: no toast; the sign-out path and the pages' own "not found" and "no access" states handle these. Test in Task 2, step 1.
4. Several reads fail at once, or a polled read (`SyncProvider`, seven `refetchInterval` reads) keeps failing while the API is down. Expected: one toast on screen, not a stack. Pinned by the fixed toast `id` in Task 2, step 4 and checked in step 7.
5. A new test file in `packages/agent-tools` that mocks `@repo/net`. Expected: it cannot break another file, in any order. Covered by the 10 random-order runs in Task 1, step 3.

---

### Task 1: Run each `agent-tools` test file in isolation

**Files:**
- Modify: `packages/agent-tools/package.json:12` (`"test": "bun test"`)
- Modify: `.agents/skills/upstream-review/DEVIATIONS.md` (section "CI, releases and dependency updates")

**Interfaces:**
- Consumes: nothing.
- Produces: nothing other tasks use.

- [ ] **Step 1: Reproduce the failure**

Run: `cd packages/agent-tools && bun test src/tools/baserow/__tests__/baserow.test.ts src/tools/gitea/__tests__/ssrf.test.ts`
Expected: `12 pass`, `1 fail`, with "Expected promise that rejects / Received promise that resolved" at `ssrf.test.ts:20`.

- [ ] **Step 2: Change the script**

In `packages/agent-tools/package.json` set `"test": "bun test --isolate"`.

- [ ] **Step 3: Verify in random order**

Run: `cd packages/agent-tools && for i in $(seq 10); do bun run test --randomize > /dev/null 2>&1 || echo "run $i failed"; done; echo done`
Expected: `done` and no "failed" line. (`bun run test --randomize` runs `bun test --isolate --randomize`.)

Run from the root: `bun run test:standalone --filter='!web'` (the CI step "Package tests"; turbo runs each package's `test` script).
Expected: `6 successful, 6 total`.

- [ ] **Step 4: Add the deviations row**

Append to the table under "CI, releases and dependency updates":

```markdown
| `packages/agent-tools/package.json` runs its tests with `bun test` | `bun test --isolate` | KEEP the flag. Several test files replace `@repo/net` with `mock.module`, and on Bun 1.4.5 the mock reaches `gitea/__tests__/ssrf.test.ts` when one of them runs first. Take upstream's other changes to the file. Drop the row when `bun test --randomize` passes 10 times without the flag. |
```

Run: `bun test scripts/` (expected: `0 fail`) and `bunx prettier --check .agents/skills/upstream-review/DEVIATIONS.md packages/agent-tools/package.json`.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-tools/package.json .agents/skills/upstream-review/DEVIATIONS.md
git commit -m "test(agent-tools): run each test file in isolation"
```

---

### Task 2: Toast a failed read that leaves a page without data

**Files:**
- Create: `apps/web/src/lib/failedRead.ts`
- Test: `apps/web/src/lib/failedRead.test.ts`
- Modify: `apps/web/src/components/providers.tsx:3` (import), `:39-49` (the comment and the `QueryClient` options)
- Modify: `.agents/skills/upstream-review/DEVIATIONS.md` (a new section, see step 6)

**Interfaces:**
- Consumes: `ApiError` from `@/lib/api/core/client` (`status: number`); `errorMessage(error, fallback)` and the `fallback` ref already in `providers.tsx`.
- Produces: `failedReadCache(notify: (error: unknown) => void): QueryCache` and `OWN_ERROR_UI: readonly string[]` (first elements of the query keys whose consumers show the error themselves), both exported from `apps/web/src/lib/failedRead.ts`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/failedRead.test.ts` drives a real `QueryClient`, so it also pins the library behaviour the design rests on (one `onError` per failed fetch, after retries).

```ts
import { describe, expect, it } from 'bun:test';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { ApiError } from '@/lib/api/core/client';
import { OWN_ERROR_UI, failedReadCache } from './failedRead';

function client() {
  const seen: unknown[] = [];
  const qc = new QueryClient({
    queryCache: failedReadCache((error) => seen.push(error)),
    defaultOptions: { queries: { retry: false } },
  });
  const fail = (queryKey: unknown[], error: unknown, meta?: Record<string, unknown>) =>
    qc.fetchQuery({ queryKey, meta, queryFn: () => Promise.reject(error) }).catch(() => {});
  return { qc, seen, fail };
}

describe('failedReadCache', () => {
  it('notifies once for a failed read that has nothing to show', async () => {
    const { seen, fail } = client();
    const down = new ApiError(500, 'down');
    await fail(['board'], down);
    expect(seen).toEqual([down]);
  });

  it('notifies for a network failure', async () => {
    const { seen, fail } = client();
    await fail(['board'], new TypeError('Failed to fetch'));
    expect(seen).toHaveLength(1);
  });

  it('notifies once however many components read the query', async () => {
    const { qc, seen } = client();
    const options = { queryKey: ['board'], queryFn: () => Promise.reject(new ApiError(500, 'down')) };
    const stop = [new QueryObserver(qc, options), new QueryObserver(qc, options)].map((observer) =>
      observer.subscribe(() => {}),
    );
    await qc.getQueryCache().find({ queryKey: ['board'] })!.promise?.catch(() => {});
    stop.forEach((unsubscribe) => unsubscribe());
    expect(seen).toHaveLength(1);
  });

  it('keeps quiet when the page still shows earlier data', async () => {
    const { qc, seen, fail } = client();
    qc.setQueryData(['board'], []);
    await fail(['board'], new ApiError(500, 'down'));
    expect(seen).toEqual([]);
  });

  it.each([401, 403, 404])('keeps quiet for a %d, which the page handles', async (status) => {
    const { seen, fail } = client();
    await fail(['board'], new ApiError(status, 'no'));
    expect(seen).toEqual([]);
  });

  it('keeps quiet for a read that opted out', async () => {
    const { seen, fail } = client();
    await fail(['board'], new ApiError(500, 'down'), { suppressErrorToast: true });
    expect(seen).toEqual([]);
  });

  it('keeps quiet for a read that shows its own error', async () => {
    const { seen, fail } = client();
    expect(OWN_ERROR_UI).toContain('link-preview');
    await fail(['link-preview', 'user', 'https://example.com'], new Error('image failed'));
    expect(seen).toEqual([]);
  });
});
```

This test file was run once against a throwaway implementation on 2026-11-24 (9 pass), then both files were deleted.

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/web && bun test --preload ./test/setup.ts src/lib/failedRead.test.ts`
Expected: FAIL, the module `./failedRead` is not found.

- [ ] **Step 3: Build the list of reads that show their own error**

Run: `git grep -nE "isError|isLoadingError" -- 'apps/web/src' ':!*.test.*'`
For each hit, open the hook that owns the query and take the first element of its `queryKey` (a literal such as `'link-preview'`, or the first element of the array a `qk.*` builder in `apps/web/src/services/queryKeys.ts` returns). Put the element in `OWN_ERROR_UI` only when the component renders a message or a fallback for the error; a hit that only hides content stays out, so its failure is toasted. Known at `71d7f582`:

| Query | Key starts with | Shows |
| --- | --- | --- |
| `useLinkPreviewQuery` (`components/common/editor/useLinkPreviewQuery.ts:36`) | `'link-preview'` | nothing on hover; `IssueRefChip` falls back to the plain link |
| `useAttachmentText` (`components/common/attachments/useAttachmentText.ts:8`) | `'attachment-text'` | `AttachmentPreviewFallback` with a message |
| the queries of `components/common/agent-runs/AgentRunTrace.tsx`, `AgentRunInternalTrace.tsx`, `AgentRunExternalTrace.tsx` | read from their hooks | a `role="alert"` line (`stepsLoadError`) |
| the links query of `components/common/DocumentLinkList.tsx:47` | read from its caller | its own error branch |

The link preview matters most: it runs on hover, and the API answers 400 to a link it will not resolve (`apps/api/src/modules/link-previews/service.ts`), so without the entry such a link toasts on every hover. A broken preview image does not fail the read (`preloadImage` resolves on `onerror`).

- [ ] **Step 4: Implement**

`apps/web/src/lib/failedRead.ts`:
- `OWN_ERROR_UI`: the list from step 3, one comment saying a read listed here shows its own error.
- `failedReadCache(notify)` returns `new QueryCache({ onError })`. `onError(error, query)` returns without calling `notify` when `query.meta?.suppressErrorToast` is set, when `query.state.data !== undefined`, when `OWN_ERROR_UI` includes `query.queryKey[0]`, or when `error` is an `ApiError` whose `status` is 401, 403 or 404. Otherwise it calls `notify(error)`.
- One comment at the top: fork-owned, so `providers.tsx` differs from upstream by one option.

In `providers.tsx`: import `failedReadCache` from `@/lib/failedRead`; add to the `QueryClient` options

```ts
queryCache: failedReadCache((error) =>
  toast.error(errorMessage(error, fallback.current), { id: 'failed-read' }),
),
```

and replace the last sentence of the comment at lines 43-44 ("Reads are not toasted — …") with: "A failed read is toasted once when it leaves the page with nothing to show." The fixed `id` makes sonner replace the toast instead of stacking one per failed read.

The library does not call `onError` for a cancelled fetch (`query.js:451-456` at 5.104.2: a `CancelledError` that is silent or reverts returns before the dispatch), so leaving a page mid-request needs no case here.

- [ ] **Step 5: Run the tests**

Run: `cd apps/web && bun test --preload ./test/setup.ts src/lib/failedRead.test.ts`
Expected: `9 pass`, `0 fail`.

Run from the root: `bun run typecheck`, `bun run lint`, `bun run --cwd apps/web test --retry=2`.
Expected: all pass. No web test renders `Providers` with a failing read today (no test imports `sonner`), so no existing test should change.

- [ ] **Step 6: Add the deviations section**

Add before "## Docs corrected against the code":

```markdown
## Failed reads

| Upstream | Ours | Notes |
| --- | --- | --- |
| `apps/web/src/components/providers.tsx` builds the `QueryClient` with a `MutationCache` only; a failed read shows the page's loading state and no message | a `queryCache` option built by `failedReadCache` in the fork-owned `apps/web/src/lib/failedRead.ts`. It shows one toast (id `failed-read`) when a read fails with no data, did not opt out with `meta.suppressErrorToast`, is not in `OWN_ERROR_UI` and the error is not a 401, 403 or 404 | KEEP the `queryCache` option, its import and the comment sentence. Take upstream's other changes to the file. When upstream adds a read that shows its own error, add its key to `OWN_ERROR_UI`. If upstream adds its own handling of failed reads, take upstream's and delete `failedRead.ts`, its test and this section. |
```

Run: `bun test scripts/` and `bunx prettier --check .agents/skills/upstream-review/DEVIATIONS.md`.

- [ ] **Step 7: See it in the browser**

This needs the local stack (`docs/development.md`). If it cannot run on this host, say so in the pull request body and do the same checks on `plan.matherly.net` right after the release that carries the change, in the Browser pane.

Run `bun run dev`, sign in, and open `/account/notifications` with the request `GET /api/account/notification-preferences` blocked in the browser's DevTools (Network, "Block request URL").
Expected: after about 1 s one toast with the error text; the skeleton stays.
Then, each with its expected result:
- Block `/api/` entirely and reload a project board: one toast, not one per request, and no new toast stacked by the sync poll.
- Unblock, throttle to "Slow 4G", open a page and leave it while its request is pending: no toast.
- Hover a link in an issue description whose preview request is blocked: no toast.
- Sign out in a second tab, then click in the first: the expired-session screen and no toast.

Record what was seen in the pull request body.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/failedRead.ts apps/web/src/lib/failedRead.test.ts apps/web/src/components/providers.tsx .agents/skills/upstream-review/DEVIATIONS.md
git commit -m "improvement(web): say so when a page's data fails to load"
```

`improvement` gives a patch release and an entry under Improvements.

---

### Task 3: Put the deferred requirement on PLAN-4

**Files:** none in the repository. One tracker write on `plan.matherly.net`, on the owner's word.

**Interfaces:** none.

- [ ] **Step 1: Read PLAN-4**

`mcp__itsaplan__get_issue_by_number` with `projectKey: "PLAN"`, `sequenceNumber: 4`. Its "To answer" list is in the description.

- [ ] **Step 2: Add two lines to "To answer"** with `mcp__itsaplan__update_issue` (the whole description is sent back with the additions; the lines hold no `@handle`, so no bot starts):

```markdown
- Pattern (owner's decision, 2026-11-24): follow Slack after upstream `946efa10`: account-level connection routes like `/slack/accounts`, a row under Channels in Account › Notifications, and an events column in both `user_notification_default` and `user_notification_preference`. A new channel also needs a key in `NotificationPreferenceDto` and an entry in the `excluded.*` set of `updateAccountPreferences`, or a PATCH drops it.
- Trace: `outbound.ts` writes no delivery row and no log when a member wants a channel but has no linked account. The Discord channel logs that case in fork-owned code.
```

- [ ] **Step 3: Verify**

Read the issue again. Expected: both lines present, nothing else changed, the issue still in Backlog.

---

## Not in this plan

Items 4 to 7 of the spec are rejected with their evidence there. The spec's item 3 fallback (a log line in `outbound.ts`) is taken up only if push fails silently after it is turned on.

## Review of this plan, 2026-11-24

Checked against the code at `71d7f582` after the first draft. Changed:

- Task 2 named no read that already shows its own error. Link previews, attachment previews, agent run traces and the document links list do, and a link preview fails with a plain `Error` on a broken image. Added `OWN_ERROR_UI`, the audit step and a test.
- Task 2 tested a pure predicate only, so nothing pinned "one toast per failed fetch". The test now drives a real `QueryClient` through `failedReadCache`.
- The browser step assumed the local stack runs on this host. It now names the fallback.
- Global Constraints lacked the `tidy`, `code-review`, `security-audit` order, the branch names, the rule against marking reads in upstream files, and the release pull request each merge opens.

Confirmed unchanged: turbo runs the package's `test` script in the CI step "Package tests"; `bun run test --randomize` appends the flag; the library skips `onError` for a cancelled fetch; upstream changed `providers.tsx` 5 times, `packages/agent-tools/package.json` 3 times and `outbound.ts` 13 times in 90 days.

Measured: the test file of Task 2, step 1 passes 9 of 9 against a throwaway `failedRead.ts` with the rule of step 4, the two-observer case included.

Not verified: the query keys of the agent run trace and document link reads (step 3 reads them); the local stack on this host.
