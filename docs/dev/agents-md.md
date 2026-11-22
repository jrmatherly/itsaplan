# Maintaining AGENTS.md

Each line of an `AGENTS.md` costs tokens on every task in its folder, and an agent does not question
a wrong line. So these files contain only what an agent would get wrong without them.

## How the files are loaded

- Claude Code reads `CLAUDE.md`. Each `CLAUDE.md` here contains only the line `@AGENTS.md`, which
  imports the `AGENTS.md` beside it. Put rules in `AGENTS.md`. A new `AGENTS.md` needs this
  `CLAUDE.md` in the same change.
- Claude Code loads the root file at session start. It loads an area file on the first read, write
  or edit of a file in that folder.
- Codex reads `AGENTS.md` files at session start, from the repository root down to the working
  directory. A session started at the root gets an area file only through the root rule that says
  to read it, so keep that rule.

## Where a fact goes

| Fact                                                      | Place                                    |
| --------------------------------------------------------- | ---------------------------------------- |
| A rule the code does not show, that most tasks there need | the nearest `AGENTS.md`                  |
| A rule a tool can check                                   | the tool: ESLint, tsc, a test, CI        |
| A no-exception rule that Claude Code can block            | `AGENTS.md` and a Claude Code deny rule  |
| How a feature works, a walkthrough, a design reason       | `docs/dev/<topic>.md`                    |
| A rule for one topic only                                 | that doc, plus one routing row           |
| Steps for a rare procedure                                | `docs/dev/<topic>.md`                    |
| A workflow an agent runs by name                          | `.agents/skills/`                        |
| A deliberate difference from upstream                     | a row in the `upstream-review` skill     |
| Why one line of code looks wrong                          | a comment on that line                   |
| An extension point for the Pro build                      | `SEAMS.md` in the private Pro repository |
| A fix, a feature, what changed                            | the commit message                       |

The routing row goes in the Docs table of the root `AGENTS.md`, or in the area file when only that
area needs the doc.

A deny rule goes in `.claude/settings.json` and stops Claude Code only, so the `AGENTS.md` line
stays. Change both in the same edit. Claude Code applies the file only to a session started at the
repository root.

## Test for a new line

Add a line only when every answer is yes:

1. Would an agent get this wrong without the line? Try it, or point to the mistake it made.
2. Is it invisible in the code? If a neighbouring file shows the pattern, leave it out.
3. Can no tool check it? If one can, add the check and leave the line out.
4. Do most tasks in this folder need it? If not, it goes in a doc.
5. Does breaking it cost data, security, a failed deploy or a release?

## When to update

Update in the same change when:

- a rule changes or stops being true;
- a file, function or command named in an `AGENTS.md` is renamed or removed;
- agents made the same mistake twice and the test above passes.

Do not update when:

- you fixed a bug, added a route, a table, a setting or a feature;
- a refactor kept the rules;
- an agent offers to record what it learned;
- a command such as `/init` generated the text.

## Format

- One rule per bullet, at most three lines, in the imperative.
- Name the file, function or command.
- Give the reason in one clause when it stops a workaround.

```markdown
<!-- Good -->

- Never add `image:` to a service that has `build:` in `docker-compose.coolify.yml`: with both,
  Coolify still builds and stops making rollback images.

<!-- Bad: describes the design and states no rule -->

`socialProviders.google` is a factory that returns the module-level `googleOptions` object.
better-auth builds the provider list once, but the provider keeps that object...

<!-- Bad: records one change -->

`0152_agent_execution_state.sql` adds the current execution marker to `agent_run`.

<!-- Bad: ESLint already fails this -->

Every language carries every key of `messages/en`.
```

## Limits

`scripts/agents-md.test.ts` runs in CI on every pull request, and a failure fails the CI run. It
reads every tracked `AGENTS.md` and fails when:

- the file is over 10,000 bytes;
- a backticked path does not exist;
- the `CLAUDE.md` beside it is missing or holds anything but `@AGENTS.md`.

The path check covers file names with a common extension and paths under `apps/`, `packages/`,
`docs/`, `scripts/`, `charts/` and `.github/`. It skips brace and wildcard forms and paths such as
`.agents/skills/`. A reference also passes when any tracked path ends with it, so after a rename
search for the old name by hand.

Over the limit, remove a line. Do not raise the limit. Claude Code loads an area file whole. Codex
cuts the combined text of the files from the repository root to the working directory at 32 KiB
(`project_doc_max_bytes`) and adds no marker. Two files at the limit stay under that cut.

No check covers the format rules.

## Reviewing a change to AGENTS.md

A change to an `AGENTS.md` affects every later agent task in that folder. Ask for the mistake the
line prevents. Reject a line that fails the test above, and move a good explanation to `docs/dev/`.

## Measuring a change

For a large rewrite, compare old and new on a set of task-like questions in clean copies of the
repository, one copy per version, with a control copy that has no `AGENTS.md`. Compare correct
answers, tokens and turns. A rule that the control gets right is a candidate for removal.
