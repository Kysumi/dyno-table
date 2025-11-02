# tests/ Directory

This directory contains test utilities and setup code for the dyno-table library's testing infrastructure. It provides the foundation for both unit tests and integration tests.

## Files

- **`ddb-client.ts`** - Configured DynamoDB client for testing (connects to local DynamoDB instance)
- **`setup-test-table.ts`** - Utilities for creating and managing test tables in local DynamoDB
- **`setup-tests.ts`** - Jest test setup and global configuration

## Testing Strategy

**Dual Testing Approach**:
- **Unit Tests** (`.test.ts`): Test individual components in isolation with mocks
- **Integration Tests** (`.itest.ts`): Test against real local DynamoDB instance for end-to-end validation

**Local DynamoDB Integration**: All integration tests run against a local DynamoDB instance using Docker:
```bash
pnpm run ddb:start        # Start local DynamoDB
pnpm run local:setup      # Create test tables
pnpm run test:int         # Run integration tests
pnpm run local:teardown   # Clean up test tables
```

## Test Infrastructure

**DynamoDB Client**: Pre-configured client that connects to local DynamoDB instance running on default port (8000).

**Table Management**: Utilities handle:
- Creating test tables with proper schema
- Cleaning up data between tests
- Managing table lifecycle during test runs

**Test Setup**: Global Jest configuration ensures:
- Proper environment variables for local testing
- Timeout configurations for DynamoDB operations
- Consistent test isolation

## Testing Philosophy

**Real Database Testing**: Integration tests use actual DynamoDB (local) to catch issues that mocks might miss:
- Expression syntax errors
- Key constraint violations
- Index configuration problems
- Actual AWS SDK behavior

**Fast Unit Tests**: Unit tests with mocks provide rapid feedback during development.

**Isolation**: Each test runs in isolation with clean table state to prevent test interference.

**Production Parity**: Local DynamoDB behaves identically to AWS DynamoDB, ensuring tests are meaningful.

## Usage Notes

- Integration tests require Docker and local DynamoDB setup
- Use `pnpm test` for fast unit tests during development
- Use `pnpm test:int` for comprehensive integration testing before releases
- Test utilities handle all DynamoDB setup/teardown automatically
