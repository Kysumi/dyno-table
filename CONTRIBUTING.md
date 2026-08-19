# Contributing to dyno-table

Thanks for considering a contribution. This is a public npm library, so API changes need extra care for backward compatibility.

## Setup

```bash
pnpm install
```

## Development

```bash
pnpm test           # unit tests
pnpm test:w         # unit tests, watch mode
pnpm run check-types
pnpm run lint
pnpm run format:check
```

### Integration tests (require local DynamoDB)

```bash
pnpm run ddb:start      # start DynamoDB in Docker
pnpm run local:setup    # create test table
pnpm test:int
pnpm run local:teardown
```

## Before opening a PR

- Run `pnpm test`, `pnpm test:int`, `pnpm run check-types`, and `pnpm run format:check` — all must pass.
- A pre-commit hook (Husky) runs Biome on staged files automatically.
- Add or update tests for any behavior change (`.test.ts` for unit, `.itest.ts` for integration).
- Update `README.md` or `docs/query-builder.md` if you're adding or changing public API.

## Commit messages

Releases are automated with semantic-release using [Angular commit conventions](https://github.com/angular/angular/blob/main/CONTRIBUTING.md#commit). The commit type determines the version bump:

- `feat:` → minor
- `fix:`, `docs:`, `style:`, `refactor:`, `perf:`, `build:`, `chore:`, `revert:` → patch
- `test:`, `ci:` → no release
- Include `BREAKING CHANGE:` in the footer (or a `!` after the type) for a major bump

## Breaking changes

This library has external consumers. Avoid breaking the public API where possible. If a breaking change is genuinely required, call it out clearly in the PR description and commit message (`BREAKING CHANGE:` footer) rather than introducing a parallel API alongside the old one.

## Code style

Formatting and linting are enforced by [Biome](https://biomejs.dev/) (`biome.json`). Run `pnpm run format` to auto-fix.
