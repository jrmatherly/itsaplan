# Local development

Requirements: [Bun](https://bun.sh) 1.4.5, the version `packageManager` pins, Docker, Git.

## Setup

```bash
git clone https://github.com/jrmatherly/itsaplan.git
cd itsaplan
bun install
bun run setup   # "Develop", or "Generate env" for just the .env files
bun run dev     # api, web, worker and bot in watch mode, via Turborepo
```

**Develop** writes the env files, generates the secrets, starts Postgres and RustFS, creates
the test database, and migrates both. Run it again any time: it restarts the stack and
re-applies the migrations, keeping the data. It offers another port when one is taken, and
offers to stop the **Try it** stack, which publishes the same ones.

`bun run dev` runs the workspace in watch mode: web on <http://localhost:3001>, api on
<http://localhost:3000>, RustFS console on <http://localhost:9001/rustfs/console/>. Only Postgres and RustFS
run in Docker; the apps run on the host.

## Environment

| File            | Read by                                         |
| --------------- | ----------------------------------------------- |
| `.env`          | api, worker, bot, drizzle                       |
| `apps/web/.env` | web — Next reads env only from its own folder   |
| `.env.test`     | the api, bot, worker and `@repo/db` test suites |

`.env.example` documents every variable and its default. The setup generates the two secrets,
`BETTER_AUTH_SECRET` and `APP_ENCRYPTION_KEY`, only while the database volume does not exist —
past that the instance is using them, and a new value would lock it out of its own data.
**Generate env** builds a fresh set of values every time, the two secrets included, and asks
before it replaces an existing `.env`.

## Commands

Run everything from the repository root through Turborepo. Use `bun`, never npm, yarn, or
pnpm: the lockfile is `bun.lock`.

| Command               | Purpose                                      |
| --------------------- | -------------------------------------------- |
| `bun run dev`         | all apps in watch mode                       |
| `bun run typecheck`   | `tsc --noEmit` across the workspace          |
| `bun run lint`        | ESLint                                       |
| `bun run format`      | Prettier, writes                             |
| `bun run db:generate` | generate a migration from the Drizzle schema |
| `bun run db:migrate`  | apply migrations                             |
| `bun run test`        | all test suites                              |

## Tests

Integration tests against a real Postgres, not mocks. The setup prepared a separate `*_test`
database with `.env.test` pointing at it; the name must contain "test", since the reset
helper empties every table between tests and refuses otherwise. The api suite runs in
parallel workers on copies of it, named `<name>_1` … `<name>_5`.

```bash
bun run test
```

`bun run test:standalone` runs the suites that need no database: web and the packages
other than `packages/db`. CI runs the same suites in the quality job, the web suite with
`--retry=2`.

The same gate CI runs for the api, bot, worker and db suites — against a throwaway Postgres,
in a container built from the production image:

```bash
docker compose -f docker-compose.test.yml build
docker compose -f docker-compose.test.yml run --rm api-test
```

The integration suite is in `apps/api`. `apps/api/AGENTS.md` explains how to write a test.

The mechanisms that span several apps — the revision engine, the interface languages — are
described in [`docs/dev/`](dev/).
