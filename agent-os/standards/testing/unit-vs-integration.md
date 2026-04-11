# Unit vs Integration Test Split

Two test types, different confidence levels — never mix them.

| | Unit (`.test.ts`) | Integration (`.itest.ts`) |
|---|---|---|
| DynamoDB | Mocked | Real (local DynamoDB via Docker) |
| Speed | Fast | Slow |
| Confidence | Logic correctness | Actual DynamoDB behavior |
| Run with | `pnpm test` | `pnpm test:int` |

## Setup for integration tests

```sh
pnpm run ddb:start    # start local DynamoDB in Docker
pnpm run local:setup  # create test table
pnpm test:int
```

## Rules

- Unit tests cover logic, validation, and builder behavior using mocks.
- Integration tests verify that DynamoDB interactions work as expected (key conditions, GSI projections, returnValues behavior, conditional expressions).
- No hard rules about what must be one or the other — use judgment about confidence level.
- Clean up test data in `beforeEach` to ensure test isolation.
