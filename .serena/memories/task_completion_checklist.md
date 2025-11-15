# Task Completion Checklist

## Required Steps After Code Changes

### 1. Code Quality Checks
- `pnpm run check-types` - Ensure TypeScript compilation passes
- `pnpm run lint` - Run Biome linter
- `pnpm run format:check` - Verify code formatting and linting
- `pnpm run circular` - Check for circular dependencies

### 2. Testing
- `pnpm test` - Run unit tests (must pass)
- `pnpm test:int` - Run integration tests if changes affect DynamoDB operations
  - Requires: `pnpm run ddb:start` and `pnpm run local:setup` first

### 3. Build Verification
- `pnpm build` - Ensure library builds successfully
- Verify dist output includes all expected entry points

### 4. Pre-commit Automation
- Husky runs `pnpm run precommit` automatically
- This runs Biome format and lint on src/ and tests/

## Library-Specific Considerations

### Breaking Changes
- **Avoid at all costs** - this is a public npm library
- If unavoidable, follow semantic versioning and document thoroughly
- Consider backward compatibility layers

### API Surface
- New public APIs must be exported in appropriate entry points
- Update exports in package.json if adding new modules
- Maintain type safety for all public interfaces

### Performance
- Consider bundle size impact (check with build output)
- Use tree-shaking friendly exports
- Test memory usage patterns for large datasets

### Documentation
- Update README.md if adding significant features
- Ensure examples are runnable and practical
- Update type documentation for public APIs

## Integration Test Requirements
- Start local DynamoDB: `pnpm run ddb:start`
- Create test tables: `pnpm run local:setup`
- Run integration tests: `pnpm test:int`
- Cleanup: `pnpm run local:teardown` (optional)

## Git Workflow
- Do NOT commit unless explicitly requested by user
- Ensure all checks pass before suggesting commit
- Use conventional commit messages if committing