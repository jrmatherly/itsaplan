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

## Rules on `main`

`main` has a repository ruleset named `main`. It is a GitHub setting, not a file. A change reaches
`main` only through a pull request whose five checks passed: `Format, lint, typecheck`,
`Build apps`, `Test suite`, `Analyze` and `Validate conventional title`. No approving review is
required. A squash merge and a merge commit are allowed. A rebase merge, a force push and a
deletion are refused.

The release PR is opened by the workflow token, so its checks wait in an approval-required state
and report nothing. Open the PR and choose **Approve workflows to run**. Each push release-please
makes to that PR needs a new approval, so approve after its last push. The PR cannot merge until
the checks pass.

A repository admin can bypass the rules on a pull request (`gh pr merge --admin`). To turn the
ruleset off: `gh api -X PUT repos/{owner}/{repo}/rulesets/<id> -f enforcement=disabled`.
`gh api repos/{owner}/{repo}/rulesets` lists the id, and `gh` fills in `{owner}` and `{repo}`.
