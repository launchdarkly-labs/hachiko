# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

Hachiko is a GitHub App that orchestrates technical migrations in large legacy codebases using configurable LLM coding agents. 

**Current Architecture**: TypeScript monorepo with pnpm workspaces
- `packages/app/` - Main Probot GitHub App 
- `packages/runner-scripts/` - CLI scripts for GitHub Actions
- **Note**: Planning to flatten to single package structure for better developer experience

## Commands

```bash
# Setup
pnpm install
pnpm build

# Development  
pnpm dev                           # Run GitHub App locally
pnpm test                          # Run tests (delegates to app package)
pnpm biome ci                      # Lint and format check
pnpm typecheck                     # TypeScript validation

# Package-specific (current workaround)
pnpm --filter @hachiko/app test:run               # Unit tests
pnpm --filter @hachiko/app test:coverage          # Tests with coverage
```

## Key Directories

- `packages/app/src/` - Main application code
  - `webhooks/` - GitHub event handlers (push, PR, comments, workflow runs)
  - `services/` - Business logic (migrations, plans, state, agents, commands)
  - `adapters/` - Agent implementations (Claude CLI, Cursor CLI, etc.)
  - `config/` - Configuration schema and validation
- `packages/app/test/` - Vitest unit tests with GitHub API mocks
- `examples/` - Migration plans and fixtures
- `.projects/` - Project status and planning documents

## Key Files

- `.hachiko.yml` - Configuration file expected in target repositories
- `examples/migrations/react-class-to-hooks.md` - Example migration plan
- `.projects/project-status.md` - Current project status and roadmap

## Development Context

**Current Issues**: 
- Monorepo complexity causing scope confusion with commands
- Low test coverage (7.4%) due to excluded integration tests
- CI pipeline works but requires package-specific commands

**Next Steps**:
- Flatten monorepo to single package structure  
- Fix integration test fixtures and improve coverage
- Simplify development workflow

## Commit Messages

When creating commits, use standard commit messages without any "Generated with Claude Code" lines. Co-author attributions are acceptable. Keep commit messages concise and focused on the changes made.