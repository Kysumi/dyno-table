---
type: operations guide
title: Continuous integration packaging and release
description: GitHub Actions validation artifact production and semantic-release publication policy for dyno-table.
tags: [ci, release, packaging]
---

# Continuous integration, packaging, and release

Repository automation has three GitHub Actions workflows. The validation workflow gates changes to `main`; the release workflow attempts publication following pushes to `main` or `alpha`; and OpenWiki refreshes generated repository documentation. Semantic-release behavior is defined in `.releaserc.json`, which is the source of truth for release branch policy rather than workflow trigger names alone.

## Validation workflow

`.github/workflows/lint-check-typescript.yml` runs for pull requests targeting `main` and pushes to `main`. It checks out the repository, installs Node 22 and pnpm dependencies, then runs in this order:

1. `pnpm lint`
2. `pnpm check-types`
3. `pnpm test`
4. `docker compose up -d dynamodb`
5. a 30-second `nc` readiness loop against port `8897`
6. `pnpm test:int`

Integration tests are therefore a CI requirement, not an optional example. The job starts DynamoDB Local but not the admin UI. Test initialization handles table creation. Changes to port, compose service name, test endpoint, or integration setup must preserve all four places: Compose, `tests/ddb-client.ts`, test table setup, and workflow readiness.

## Build and distribution

`pnpm build` runs tsdown. Its entry map emits the root plus `table`, `entity`, `conditions`, `types`, `standard-schema`, `utils`, and `builders`; output is ESM, CJS, and declarations. `package.json` publishes only `dist`, names the generated main/module/types paths, and maps every supported import with `exports`/`typesVersions`. See [public API](../reference/public-api.md) for change surface details.

## Release policy and publication boundary

`.github/workflows/release.yml` triggers on pushes to `main` and `alpha`, uses full git history, Node 24, installs dependencies, builds, and invokes `semantic-release@25.0.9`. It grants GitHub content/issues/pull-request permissions and `id-token: write` for trusted publishing. The workflow passes `GITHUB_TOKEN` from GitHub Actions; documentation must never expose token values.

`.releaserc.json` configures semantic-release branches as `main`, maintenance version branches matching its pattern, and prerelease `next`. `alpha` is a workflow trigger but is not listed in this semantic-release branch configuration; if it is intended to publish, reconcile the workflow and release config rather than assuming a release occurs.

The Angular conventional-commit analyzer maps `feat` to minor, most `fix`/docs/style/refactor/perf/build/chore/revert changes to patch, `test` and `ci` to no release, and breaking changes to major. It generates release notes/changelog, publishes through npm and GitHub plugins, and commits generated `package.json` and `CHANGELOG.md` with `chore(release): ${nextRelease.version} [skip ci]`.

## Documentation automation

`.github/workflows/openwiki-update.yml` runs manually or daily at `0 8 * * *`. It checks out full history because `openwiki code --update` diffs against the prior documented commit, uses Node 22, installs OpenWiki plus Mermaid/jsdom validation dependencies, and runs `openwiki code --update --print`. Its external boundary is the configured OpenRouter provider/model and the LangSmith connector/tracing environment; credentials are GitHub secrets and must never be placed in source or documentation.

It uses `peter-evans/create-pull-request` to create/update `openwiki/update` with `docs: update OpenWiki`, including `openwiki`, `AGENTS.md`, `CLAUDE.md`, and the workflow itself. Treat this as a generated documentation PR that still needs normal review for source grounding and safe instructions.

## Maintenance guidance

A public API change needs both normal validation and package build. A release-policy change needs review of workflow triggers, `.releaserc.json`, dependency/plugin availability, generated-file assets, and branch protection. An OpenWiki automation change also needs review of its update scope, full-history requirement, provider/connector boundary, and PR paths. Recent history includes release commits and `f484b03` (internals rework), reinforcing that changelog/version commits are automation output, not hand-authored implementation changes.

For local test and build commands, see [testing](testing.md).