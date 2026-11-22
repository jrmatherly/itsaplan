---
name: upstream-review
description: Review what changed in upstream croffasia/itsaplan since the last review, check with a dry run and GitHub whether it merges cleanly, and bring it into this fork without disturbing the fork's deviations. Use for "sync from upstream", "sync fork", "what changed upstream", "are we behind upstream", "review upstream commits", "bring upstream commit X in", or any periodic upstream check. Also use before changing a file upstream owns, to record the change in the deviations table.
---

# Upstream review

This repository is the GitHub fork `jrmatherly/itsaplan` of `croffasia/itsaplan` and shares history
with it. It is an independent distribution. Diverging from upstream is intended. The goal of a
review is to know what upstream did and take it without losing what the fork changed on purpose.

Every deliberate difference is a row in [DEVIATIONS.md](DEVIATIONS.md). Read it before you resolve
a conflict, and add a row in the same change that creates a new difference.

## Sync policy: merge first

- **Default is a merge.** When every verdict is ADOPT and `--dry-run-merge` is clean, run
  `git merge <tip-sha>` on a branch, run the validation batch, and open a pull request. Merge the
  SHA you reviewed, never `upstream/main`: each driver run fetches again, and upstream may have
  moved.
- **Land that pull request with "Create a merge commit", never "Squash and merge".** A squash drops
  upstream's ancestry: the merge-base stays where it was, GitHub keeps reporting the fork as
  behind, and the next merge replays the same commits. Every other pull request in this repository
  is squash-merged, so say this in the PR description.
- **Upstream's commits reach `main` with their own subjects.** release-please reads them: an
  upstream `feat:` raises the fork's next minor version and is listed in `CHANGELOG.md`, and its
  `(#NNN)` links to this fork's pull request of that number. Tell the owner before the first merge.
- **A SKIP is a merge followed by a revert.** Merge, then `git revert <sha>` with the subject
  `revert: <original subject> (upstream <short-sha>)`, and add a row to DEVIATIONS.md with the SHA.
  Holding back the whole merge for one commit leaves every later commit unmerged.
- **An ADAPT is a conflict resolved by its row.** Take upstream's side for everything the row does
  not name.
- **Cherry-pick (`git cherry-pick -x`) only to take one fix ahead of the next merge.** The later
  merge absorbs it, and the listing tags it `[picked]`.
- **Never fetch upstream's tags.** Both repositories cut `vX.Y.Z` tags, and from the fork's first
  own release the same number names a different commit in each. The driver fetches with
  `--no-tags` and sets `tagOpt` on the remote.
- Never commit or push unless the owner asks.

## Tooling

| Piece | Path |
| --- | --- |
| Driver | `.agents/skills/upstream-review/scripts/upstream-review.sh` (needs `jq`; `--github` needs `gh`) |
| Deviations table | `.agents/skills/upstream-review/DEVIATIONS.md` |
| Watermark | `.upstream-review/watermark.json` (`forkPointSha` is fixed, `lastReviewedSha` advances) |
| Decision logs | `.upstream-review/reviews/<YYYY-MM-DD>-review.md` |

```bash
S=.agents/skills/upstream-review/scripts/upstream-review.sh
$S                    # fetch, list un-reviewed commits oldest first
$S --stat             # + each touched file with a divergence marker
$S --urls             # + GitHub commit URL per commit
$S --show <sha>       # one upstream commit's diff
$S --diverged         # our footprint against the merge-base
$S --dry-run-merge    # merge in memory: clean, or the conflicting files; exit 1 on conflict
$S --github           # GitHub compare: ahead, behind, status
$S --advance <sha>    # after the log is written; the listing prints the tip SHA
```

The window is `lastReviewedSha..` the fetched tip. The driver compares `HEAD:<path>`, so run it
from the branch you will merge onto. Run
`gh repo set-default jrmatherly/itsaplan` once per clone: with two remotes and no default, `gh`
can resolve to upstream.

Markers in `--stat`, our `HEAD` against the commit's own parent:

| | Meaning | In a merge |
| --- | --- | --- |
| `=` | ours equals the pre-image | clean |
| `<` | ours equals the merge-base | an earlier un-reviewed upstream commit touched it; both come |
| `~` | ours differs from both | we changed it; resolve by its DEVIATIONS.md row |
| `x` | we removed it | check "Deleted paths" in DEVIATIONS.md |
| `+` | new upstream file | created |
| `bin` | binary | inspect by hand |

## Method

1. Run `--stat` and `--github`.
2. For each commit that is not `[merge]` or `[picked]`, run `--show <sha>` and read the diff. For a
   window over about 20 commits, give each area to a subagent with the SHAs and steps 2 to 4.
3. Run the checks under "What to look for" on the window.
4. Give each commit a verdict: `ADOPT` (comes in with the merge), `ADAPT` (merge, then apply the
   row), `SKIP` (merge, then revert), `MONITOR` (nothing to do now, a later change may need it).
5. Run `--dry-run-merge`. Conflicts should be the `~` files your ADAPT verdicts name. A surprise
   conflict is an unrecorded deviation: add its row first.
6. Write the decision log from the template below, with file-level evidence for each verdict.
7. Run `--dry-run-merge` again and check it names the tip SHA you reviewed. On a branch:
   `git merge <tip-sha>`, resolve, apply the SKIP reverts, run the validation batch.
8. `--advance <tip-sha>` with the SHA from the listing you reviewed, and include `.upstream-review/`
   in the merge's pull request.

## What to look for

A clean merge can still break the fork. Check the window for each of these:

- **A new environment variable.**
  `git diff <base> upstream/main | grep -E '^\+.*(process|Bun)\.env\.'`. Root `AGENTS.md` says
  where each one goes: `.env.example`, the five compose files and the Helm chart. Upstream does
  not always add all of them.
- **A new image, service or workflow.** It names `ghcr.io/croffasia` or an unpinned action. Apply
  the "Distribution" and "CI" rows.
- **A new link to `croffasia/itsaplan` or `itsaplan.dev`.**
  `git diff <base> upstream/main | grep -E '^\+.*(croffasia|itsaplan\.dev)'`. Decide by the
  "Distribution" and "Deliberately left on upstream" tables.
- **A telemetry change.** Any hunk in `apps/worker/src/telemetry*.ts` or `TELEMETRY.md`.
- **A migration.** New files in `packages/db/drizzle/`. The fork has none of its own. If it ever
  adds one, a later upstream migration takes the same number: record that as a deviation.
- **A release commit.** `chore: release main` rewrites version tokens the fork owns. Apply the
  version row.
- **A change under `.agents/`, `.claude/`, `scripts/` or to any `AGENTS.md`.** The fork's checks
  read these. Re-run `bun test scripts/` on the merged tree.

## Validation batch

A clean merge runs no hook. Finishing a merge that had conflicts runs the pre-commit hook on every
file the merge brings in, and `eslint --fix` or `prettier --write` can rewrite upstream's files:
check `git diff <tip-sha> -- <path>` for those. Run this batch either way, from the repository
root:

```bash
bun install               # upstream may have changed dependencies
bun run typecheck
bun run lint
bun run format:check
bun test scripts/
bun run db:migrate:test   # only when the window added migrations; needs the test Postgres
bun run test              # needs the test Postgres; see docs/development.md
```

Say in the decision log which of these ran and which did not.

## Decision log template

```markdown
# Upstream review: <YYYY-MM-DD>

Window: <last-reviewed-short>..<tip-full-sha> (<N> commits). Merge-base <short>.

## Headline

<two or three sentences: what upstream shipped, whether it merges cleanly, what needs a decision>

## Verdicts

| Commit | Subject | Verdict | Evidence |
| --- | --- | --- | --- |

## Checks

<each item under "What to look for": what the command returned>

## Landed

<the merge commit and PR, or "not merged">

## Open for the owner

<decisions only the owner can make>
```

## Mistakes to avoid

- Squash-merging the upstream pull request.
- Merging without `--dry-run-merge`, or resolving a `~` conflict without reading its row.
- Running `git fetch upstream` without `--no-tags` in a clone the driver has not configured.
- Advancing the watermark before the decision log names the SHA. The driver refuses.
- Changing an upstream-owned file without adding a row to DEVIATIONS.md.
