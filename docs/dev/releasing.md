# Commits and releases

Subject: Conventional Commit, `type(scope): summary`. A squash-merged PR puts its title on `main`
as the commit subject (`pr-title.yml` checks it). A PR landed as a merge commit puts each of its
commit subjects on `main`. release-please reads the subjects to pick the next version and write
`CHANGELOG.md`.

Pick the type by what the change gives the user, not by how much code it touches:

- **`feat:` — minor.** A capability that did not exist: a new entity, page, integration, or a
  setting that unlocks behaviour. Use it only for a change that earns a "Highlights" entry.
- **`improvement:` — patch.** A visible change to something that exists: a redesign, a
  reworked layout, a theme, a better interaction. Not a bug fix, not a new capability.
- **`fix:` — patch.** Behaviour that was wrong is now right.
- **Every other type (`perf`, `refactor`, `docs`, `build`, `ci`, `test`, `chore`, `revert`) —
  patch.**

Scope: the name of one app or package (`api`, `web`, `worker`, `bot`, `db`, `auth`, …). No
scope when the change spans several.

Release config traps:

- Add a new commit type to both `pr-title.yml` and `changelog-sections` in
  `release-please-config.json`. release-please drops a type that is not in
  `changelog-sections` from the release notes.
- Keep `"package-name": ""` in `release-please-config.json`. Without it, release-please skips
  every release and stops at `There are untagged, merged release PRs outstanding - aborting`.
- A package a release publishes to GHCR for the first time is private. Set each new one to public
  in its package settings: the four `itsaplan-*` images and `charts/itsaplan`. Until then
  `docker compose pull` and `helm install` fail for a user who is not signed in to the registry.

## Before merging the release PR

release-please writes the release notes into the release PR's body and into `CHANGELOG.md` on
`release-please--branches--main`. It writes both again on every push to `main`, so make these
edits last, with nothing else waiting to merge. The GitHub Release takes its notes from the PR
body, and the app shows them under **What's new**.

- Read the notes for a change an operator must act on before updating, such as a setting that
  takes effect for the first time or a migration that needs a backup. Put it in an "Updating"
  paragraph above the first section.
- A commit that came from upstream ends in one or more `(#NNN)`, upstream's pull request
  numbers. release-please links each to this repository, where that number is missing or belongs
  to an unrelated pull request. Change each link to
  `https://github.com/croffasia/itsaplan/pull/NNN`.
- A pull request landed as a merge commit adds an entry for its own title. Delete it when the
  entry repeats commits the notes already list.
- Make the same edits in `CHANGELOG.md` on the branch `release-please--branches--main`, in one
  commit.
- Approve the workflow runs (see "Rules on `main`"), then merge.

## Rules on `main`

`main` has a repository ruleset named `main`. It is a GitHub setting, not a file. A change reaches
`main` only through a pull request whose five checks passed: `Format, lint, typecheck`,
`Build apps`, `Test suite`, `Analyze` and `Validate conventional title`. No approving review is
required. A squash merge and a merge commit are allowed. A rebase merge, a force push and a
deletion are refused.

The ruleset also requires code scanning results from CodeQL. A pull request cannot merge while
its analysis reports a new security alert at high or above or a new quality alert at error, or
while the analysis has not finished. Dismissed alerts on `main` do not block it.

The release PR is opened by the workflow token, so its checks wait in an approval-required state
and report nothing. Open the PR and choose **Approve workflows to run**. Each push release-please
makes to that PR needs a new approval, so approve after its last push. The PR cannot merge until
the checks pass.

A repository admin can bypass the rules on a pull request (`gh pr merge --admin`). A deny rule in
`.claude/settings.json` refuses that command to Claude Code, so a person runs it. To turn the
ruleset off: `gh api -X PUT repos/{owner}/{repo}/rulesets/<id> -f enforcement=disabled`.
`gh api repos/{owner}/{repo}/rulesets` lists the id, and `gh` fills in `{owner}` and `{repo}`.

## Other repository settings

These are GitHub settings too, not files.

- The ruleset `release tags` covers `refs/tags/v*`. A release tag cannot be deleted, moved or
  force-pushed, and nobody can bypass it. Creating a tag is allowed, which is what release-please
  does.
- The ruleset `release branch` refuses a deletion and a force push of `release`. The release
  workflow's fast-forward push passes.
- Immutable releases are on. The tag and the assets of a release published after 1.13.0 are
  locked, and its title and notes stay editable. A deleted release's tag name cannot be used
  again, so a wrong release is corrected by the next version. A step that uploads a release asset
  after release-please publishes would be refused: the images and the chart go to GHCR, not to
  the release.
- Actions must be pinned to a full commit SHA. A workflow that references an action by tag does
  not run. A reusable workflow in this repository (`./.github/workflows/...`) needs no pin.
- A merged pull request's branch is deleted. release-please creates its branch again on the
  next push to `main`.
