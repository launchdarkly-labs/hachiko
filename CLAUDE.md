# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

Hachiko is a GitHub App that orchestrates technical migrations in large legacy codebases using configurable LLM coding agents. It supports cloud-based AI agents (Cursor, Devin, Codex) and can run as either a GitHub App or via GitHub Actions workflows.

**Architecture**: Single-package TypeScript project (ESM, strict mode) with pnpm.

## Commands

```bash
# Setup
pnpm install
pnpm build                         # tsc -b

# Development
pnpm test                          # vitest run (all tests)
pnpm coverage                      # vitest run --coverage
pnpm lint                          # oxlint
pnpm format                        # oxfmt --write
pnpm typecheck                     # tsc --noEmit
```

## Key Directories

- `src/` - Application source (`rootDir`, compiles to `dist/`)
  - `adapters/agents/` - Cloud agent adapters (Cursor, Devin, Codex, mock)
  - `services/` - Core business logic:
    - `state-inference.ts` - Infers migration state from PR activity
    - `pr-detection.ts` - Multi-path PR detection (branch, label, body/title tokens, commits)
    - `workflow-orchestration.ts` - Dashboard parsing, step calculation, frontmatter mutation
  - `scripts/handle-dashboard-event.ts` - CLI entry point for GitHub Actions workflows
  - `testing/github-simulator.ts` - In-memory GitHub API fake for integration tests
  - `config/` - Configuration and migration schema validation
  - `utils/` - Shared utilities (logger, git, errors, etc.)
- `test/` - Vitest tests (excluded from `tsconfig.json`)
  - `unit/` - Unit tests with `vi.mock()` / `vi.fn()`
  - `integration/scenarios/` - Integration tests using `GitHubSimulator`
  - `integration/github-api/` - Live GitHub API tests (excluded from `vitest.config.ts`)
- `migrations/` - Migration document files (frontmatter + markdown)
- `.projects/` - Planning and architecture documents

## Testing

**Test framework**: Vitest with ESM. ~500 tests across 38 files.

**Two testing patterns**:

1. **Unit tests** (`test/unit/`) — Traditional `vi.mock()` mocks for isolated function testing
2. **Integration tests** (`test/integration/scenarios/`) — Use `GitHubSimulator`, a stateful in-memory fake that implements the Octokit API surface Hachiko uses. Services run against it unchanged.

**GitHubSimulator** (`src/testing/github-simulator.ts`):

- Agent-specific PR factories: `createHachikoPR()`, `createCursorPR()`, `createDevinPR()`
- Each factory encodes real PR shape conventions (branch naming, tracking token placement)
- Provides `context()` returning `ContextWithRepository` compatible with all services
- Tracks `workflowDispatches`, `workflowRuns`, `files`, `issues`, `pullRequests`

**PR detection paths** (important for understanding tests):

- Path 1: `hachiko/{id}-step-{N}` branch naming (hachiko-native)
- Path 2: `<!-- hachiko-track:{id}:{step} -->` in PR body (Cursor) or title
- Path 3: `hachiko-track:{id}:{step}` in commit messages (Devin)

**Known gotcha**: `extractMigrationIdFromBranch` has a `descriptionWords` list that trims suffixes. Migration IDs containing words like "hooks", "tests", "cleanup", "final", "step" etc. will be truncated.

## Key Types

- `ContextWithRepository` (`src/types/context.ts`) — `{ octokit: Octokit, payload: { repository: { owner: { login }, name } } }`
- `HachikoPR` (`src/services/pr-detection.ts`) — Detected PR with `migrationId`, `stepNumber?`, `merged`, etc.
- `MigrationStateInfo` (`src/services/state-inference.ts`) — Inferred state with `currentStep`, `openPRs`, `closedPRs`
- `MigrationFrontmatterV1` / `V2` (`src/config/migration-schema.ts`) — Schema versions for migration documents

## Git Workflow

- Create feature branches for all changes: `git checkout -b fix/your-fix-name`
- Push branches and create PRs: `git push -u origin your-branch-name`
- Use descriptive branch names (fix/, feat/, docs/, etc.)
- Never commit to main directly

## Committing

- Use standard commit messages. Co-author attributions are acceptable.
- Keep commit messages concise and focused on the changes made.
