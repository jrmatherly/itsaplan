# Pull request 39 review: findings and decisions for the fork

Date: 2026-11-24. Source: three `pr-review-toolkit` reviews of pull request 39 (upstream sync
`57f06d14`, mainly upstream `946efa10`, notification settings with defaults) and one research
pass. The owner's decision: nothing is reported upstream; each item is decided for the fork.

The plan that implements the "fix" rows is `docs/superpowers/plans/2026-11-24-pr39-review-fixes.md`.

Each claim is labelled: **measured** (a command was run), **read** (from source) or
**inferred**.

## Summary

| # | Item | Likelihood on this instance | Decision | Fix shape | Deviation cost |
| --- | --- | --- | --- | --- | --- |
| 1 | A test in `packages/agent-tools` fails depending on file order | High in CI: 3 of 8 and 7 of 10 random orders failed | Fix | `bun test --isolate` in the package's test script | Low: one line in a file identical to upstream |
| 2 | A page whose read fails shows a loading skeleton and no message | Low to medium: the API must fail twice about 1 s apart while a page loads, as during a deploy | Fix, centrally | A `QueryCache` built in a fork-owned file, which also lists the reads that show their own error; one option in `providers.tsx` | Medium: 3 lines in a file upstream changed 5 times in 90 days |
| 3 | A wanted notification that cannot be delivered leaves no record | Medium once push is on and Discord exists | Defer; a requirement for PLAN-4 | None now | None now |
| 4 | Fixed 50 ms waits in two new web tests | Low: 0 failures in 80 runs | Reject | None | Avoided |
| 5 | `setProjectPreferences` reads then writes outside a transaction | Near zero: no client in the repository sends the PUT | Reject | None | Avoided |
| 6 | `toToggles` reads a stored non-boolean as on | Near zero: manual SQL only | Reject | None | Avoided |
| 7 | Test gaps rated 3 to 5 in the review | Low: Slack is not connected on the instance | Reject | None | Avoided |

Done already in pull request 39 (`2ca2b7dc`): three API tests in the fork-owned file
`apps/api/src/modules/notification-preferences/__tests__/integration/notification-preferences-scope.test.ts`.

## 1. Order-dependent test in `packages/agent-tools` (fix)

- **Measured, CI.** Run `45466059171`, job "Format, lint, typecheck", step "Package tests", head
  `c8bef745`: `src/tools/gitea/__tests__/ssrf.test.ts:20` failed with "Expected promise that
  rejects / Received promise that resolved". The re-run on the next head passed. The merge did
  not touch `packages/agent-tools`.
- **Measured, local, Bun 1.4.5.** `cd packages/agent-tools && bun test
  src/tools/baserow/__tests__/baserow.test.ts src/tools/gitea/__tests__/ssrf.test.ts` gives 12
  pass, 1 fail, with the same message. `bun test --randomize` failed 3 of 8 runs (the research
  pass: 7 of 10). `bun test --isolate --randomize` failed 0 of 8 (research: 0 of 15).
- **Read.** Eight test files replace `@repo/net` with `mock.module`. `ssrf.test.ts` needs the
  real guard. Paired with it, three of the eight make it fail (`baserow.test.ts`,
  `firecrawl/__tests__/base-url.test.ts`, `gitlab/__tests__/merge-requests.test.ts`).
- **Read, docs.** https://bun.com/docs/test/mocks says a module mock is removed when the test
  file ends. Bun 1.4.5 does not behave that way here. The mechanism was not found.
- **Measured.** A `bunfig.toml` with `[test] isolate = true` did not fix the failing seed, so
  the flag goes in the script.
- **Cost.** The suite goes from about 70 ms to about 270 ms. `packages/agent-tools/package.json`
  is identical to upstream today; upstream changed it 3 times in 90 days (measured with `git log --since='90 days ago' upstream/main`).
- **Rejected alternative.** `--isolate` only in the CI step: `bun run test` on a developer
  machine would stay order-dependent.

## 2. A failed read shows a skeleton and no message (fix, centrally)

- **Read.** `apps/web/src/features/account/AccountNotificationsPage.tsx:19,37` renders
  `ListSkeleton` while `!data || pending` and never reads the error.
  `useAccountNotificationChannels.ts:22-23` adds the Telegram and Slack columns only when their
  data exists, so a failed accounts read drops the column with no message.
- **Read.** The rule is app-wide. `apps/web/src/components/providers.tsx:41-49`: a
  `MutationCache` `onError` toasts every failed mutation; "Reads are not toasted — a failed
  query renders its own empty/loading state in place."
- **Measured, library, in Bun.** With the app's defaults (`retry: 1`,
  `refetchOnWindowFocus: false`) a failing query makes 2 calls and settles into `isError: true,
  data: undefined` about 1 s after the first failure. A focus change does not refetch. A new
  observer mounting does. So the skeleton stays until the user navigates away and back or
  reloads.
- **Measured by grep, not audited by hand.** 223 non-test `.tsx` files call a `use*Query` hook;
  180 do not read the error state; 69 of those render a skeleton. Pages inside the project
  shell are covered by `useShellProject`; account pages use `FullPageView` and are not.
- **Read.** `@tanstack/react-query` `^5.104.2`. In the installed `query.js` the cache calls
  `onError(error, query)` once per failed fetch, after retries, not once per observer (also
  measured with two observers).
- **Docs fetched.** https://tanstack.com/query/v5/docs/framework/react/reference/useQuery and
  https://tanstack.com/query/latest/docs/framework/react/guides/query-retries.
- **Options.** (a) A central `QueryCache` `onError` toast: one place, every page covered.
  Chosen. (b) An error state in `FullPageView` or a gate component: better on the page, but
  each page must pass its query in, so the edits spread over upstream's page files. Rejected on
  deviation cost. (c) Per-page fixes: 180 candidate files. Rejected.
- **Read, 2026-11-24 plan review.** Some reads already show their own error: link previews (`useLinkPreviewQuery`, run on hover; the API answers 400 to a link it will not resolve), attachment previews (`useAttachmentText`), the agent run traces and the document links list. A central toast must leave these out, so the fork-owned file carries the list of their query keys. The library does not call `onError` for a cancelled fetch (`query.js:451-456`).
- **Measured, 2026-11-24 plan review.** The plan's test file passed 9 of 9 against a throwaway implementation driven by a real `QueryClient`: one notification per failed fetch with two observers, none with earlier data, none for 401, 403 or 404.
- **Not done.** Option (a) was not seen in a browser.

## 3. No record of a wanted notification that cannot be delivered (defer)

- **Read.** `apps/api/src/modules/notifications/outbound.ts`, the loop near lines 419-442: a
  Telegram or Slack row is written only when a chat id or Slack user id exists. Nothing is
  logged otherwise. The same loop skips with no record for no preferences, a deactivated
  account, a disabled channel and a push user with no subscription.
- **Read.** `notification_delivery` has `channel, recipient, payload, status, attempts,
  next_attempt_at, last_error, created_at`. The worker deletes a row on success, keeps a
  `pending` row with `last_error` between retries and sets `status = 'failed'` at the end
  (`apps/worker/src/notification-delivery.ts:69-86`). No page in the web reads the table.
- **How to diagnose today.** From `~/dev/home-cluster`, read-only:
  `SELECT channel, recipient, status, attempts, last_error, created_at FROM notification_delivery WHERE status <> 'pending' OR last_error IS NOT NULL ORDER BY created_at DESC;`
  A row means queued and failed. No row means sent or never queued; the two cannot be told
  apart.
- **Decision.** No edit to `outbound.ts` now: upstream changed it 13 times in 90 days. PLAN-4
  takes the requirement that the Discord channel logs a wanted-but-unlinked recipient in
  fork-owned code. If push fails silently after it is turned on, the fallback is one log line
  per skipped channel in `outbound.ts` (about 6 lines).
- **Adjacent, read.** Failed `notification_delivery` rows are never deleted. Slow growth on a
  small instance. No action.

## 4. Fixed-delay waits in two web tests (reject)

- **Read.** `settle()` is local to `AccountNotifications.test.tsx:89-91` and
  `AccountNotificationPush.test.tsx:104-106`. About 30 web test files have a similar wait.
- **Measured.** 0 of 20 runs failed for each file idle and 0 of 20 for each under 24 busy loops
  on 12 cores. Not run inside the full `--parallel` suite.

## 5. `setProjectPreferences` race (reject)

- **Read.** `service.ts:230-245` reads, then upserts, with no transaction. The web calls only
  GET and PATCH `/account/notification-preferences`. The PUT is not an MCP tool. Only tests
  call it.

## 6. `toToggles` (reject)

- **Read.** Only `updateAccountPreferences` and `setProjectPreferences` write the two tables,
  both through `toDto`. No importer, SCIM code, project copy, seed or migration writes them.
- **Measured.** The route schema answers 422 to `"false"`, `0`, `null` and a non-object channel.

## 7. Test gaps rated 3 to 5 (reject)

Undo on a bulk replace (`useAccountNotificationUpdate.ts:35-37`), Slack unlink scoped to the
user, a wrong `aud` or `nonce` in `completeSlackLink`, the `/slack/connect` page. All in
upstream's files; Slack is not connected on the instance.

## Leads not traced

- `applyToAll` in `useAccountNotificationUpdate.ts:43-46` awaits `mutateAsync` with no catch.
  One reviewer read that `ConfirmDialog` keeps the dialog open on the rejection; the research
  pass did not trace it.
- Why CI's file order differed from the local default order.
