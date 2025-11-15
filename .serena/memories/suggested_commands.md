# Essential Commands for dyno-table Development

## Development Workflow
- `pnpm install` - Install dependencies
- `pnpm build` - Build the library for distribution using tsup
- `pnpm clean` - Remove dist directory

## Testing (Critical for External Library)
- `pnpm test` - Run unit tests (excludes integration tests)
- `pnpm test:w` - Run tests in watch mode
- `pnpm test:int` - Run integration tests (requires local DynamoDB)

## Local DynamoDB for Testing
- `pnpm run ddb:start` - Start local DynamoDB in Docker
- `pnpm run local:setup` - Create test table for integration tests
- `pnpm run local:teardown` - Delete test table

## Code Quality (Important for Public Library)
- `pnpm run lint` - Run Biome linter
- `pnpm run check-types` - TypeScript type checking
- `pnpm run format` - Format code using Biome
- `pnpm run format:check` - Check code formatting and linting
- `pnpm run precommit` - Format and lint src/tests (used by Husky)
- `pnpm run circular` - Check for circular dependencies using madge

## Git Workflow
- `git status` - Check current changes
- `git add .` - Stage all changes
- `git commit -m "message"` - Commit with message
- `git push` - Push to remote

## System Commands (macOS/Darwin)
- `ls -la` - List files with details
- `find . -name "*.ts"` - Find TypeScript files
- `grep -r "pattern" src/` - Search for patterns in source
- `cat filename` - Display file contents
- `pwd` - Show current directory