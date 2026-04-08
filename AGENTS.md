# AGENTS.md

## Project Overview
- `dyno-table` is a TypeScript library for building type-safe DynamoDB table and entity workflows.
- The source of truth is under `src/`; build output goes to `dist/`.
- Keep changes focused, minimal, and aligned with the existing public API shape.

## Working Agreements
- Prefer surgical fixes over broad refactors.
- Do not edit generated output in `dist/`.
- Do not introduce new dependencies unless they are clearly necessary for the requested task.
- Preserve existing ESM/CJS package exports unless the task explicitly requires changing them.
- When changing public behavior or developer ergonomics, update the relevant docs in `README.md`, `docs/`, or `src/**/README.md`.

## Repository Layout
- `src/` — library source, including table, entity, builders, utils, and tests.
- `tests/` — integration-test setup helpers for local DynamoDB workflows.
- `docs/` — user-facing documentation.
- `examples/entity-example/` — example consumer project.
- `tsup.config.ts` — JavaScript build config.
- `tsconfig.types.json` — declaration build config.
- `vitest.config.ts` — unit test config.
- `vitest.integration.ts` — integration test config.

## Install & Run
- Use `pnpm` for dependency management. Install dependencies with `pnpm install`.
- Build with `pnpm build`.
- Run unit tests with `pnpm test`.
- Run integration tests with `pnpm test:int`.
- Run linting/format checks with `pnpm lint` and `pnpm format:check`.
- Run type checks with `pnpm check-types`.

## Testing Guidance
- Prefer targeted unit tests for logic changes in `src/**/*.test.ts`.
- Use integration tests in `src/**/*.itest.ts` only when behavior depends on real DynamoDB interactions.
- Integration tests rely on local infrastructure:
  - Start DynamoDB Local with `pnpm ddb:start`
  - Create the test table with `pnpm local:setup`
  - Remove it with `pnpm local:teardown`
- If you change query builders, entity indexing, transactions, or serialization behavior, add or update the closest relevant tests.

## Code Style
- Match the existing TypeScript style and naming conventions in neighboring files.
- Follow Biome formatting and lint expectations defined in `biome.json`.
- Prefer explicit, descriptive names over one-letter variables.
- Reuse existing helpers and builder patterns before adding new abstractions.
- Avoid inline comments unless the code is genuinely non-obvious.

## API & Types
- Treat exported types and builder APIs as user-facing contracts.
- If you add a new public entry point, make sure `tsup.config.ts`, `package.json` exports, and type generation stay consistent.
- Keep runtime behavior and type-level behavior aligned; this library’s value depends on both.

## Validation Checklist
- Run the smallest relevant test command first.
- For code changes, prefer this validation order when applicable:
  1. `pnpm check-types`
  2. `pnpm test` or a targeted Vitest run
  3. `pnpm test:int` for DynamoDB-backed changes
  4. `pnpm build`
- If you cannot run a validation step, state that clearly in your handoff.

## Guardrails
- Avoid unrelated file churn.
- Do not commit or tag releases unless explicitly asked.
- Do not modify `.gitignore` unless the task introduces a new generated artifact that should be ignored.
