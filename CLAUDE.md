# Parking exit fee API

## Install

- Node 26 and pnpm (version pinned in `package.json`).
- `pnpm install`, then `cp .env.example .env`.

## Run

- `node --env-file-if-exists=.env src/main.ts` (Node runs TypeScript directly, no build step).
- Health check: `GET /health`.

## Test

- Every gate: `./scripts/verify.sh`
- Final gates (whole-project mutation): `./scripts/verify.sh --final`
- Unit tests: `pnpm exec vitest run --project unit`; integration: `--project integration`.
- Acceptance scenarios: `pnpm exec cucumber-js`.
- Unit tests sit next to the code as `*.test.ts`; tests against real SQLite are
  `*.integration.test.ts`. Acceptance scenarios and step definitions live in `features/`.

## Test data

- Synthetic licence plates only (e.g. `1234ABC`, `TEST001`); never real plates.
- Tests use an in-memory SQLite database or a temporary file, and a fixed clock in Europe/Madrid.

## software-factory

- Product and structure: `ARCHITECTURE.md`. Configuration: `software-factory.yml`.
- `.env.example` holds synthetic values only. Each worktree copies it to `.env`.
- Files in `.protected-files` change only through a pull request of the owner.

## Commits

These rules override any general commit rule of the user or the tools for this project.

Conventional Commits in English, with an optional scope. A commit written by an agent names it in
an `Agent:` trailer, and every commit names its issue in a `Refs:` trailer:

```sh
git -C "<worktree>" commit -m "<type>[(<scope>)]: <description>" \
  --trailer "Agent: <agent>" --trailer "Refs: #<issue>"
```

A commit without `Agent:` was made by a person. The git identity is the owner's for every commit.

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
The scope is a noun naming a part of the codebase. A breaking change adds `!` before the colon:
`<type>[(<scope>)]!: <description>`. Pull request titles follow the same format.
