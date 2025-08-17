# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hachiko is a GitHub App that orchestrates technical migrations in large legacy codebases using configurable LLM coding agents. It's built as a TypeScript monorepo using pnpm workspaces with two main packages:

- `packages/app/` - Main Probot GitHub App that handles webhooks and orchestrates migrations
- `packages/runner-scripts/` - CLI scripts that run in GitHub Actions for agent execution

## Common Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run the GitHub App locally (with webhook proxy)
pnpm dev

# Run tests
pnpm test

# Run tests with coverage
pnpm coverage

# Lint code
pnpm lint

# Format code
pnpm format

# Type check
pnpm typecheck

# Development scripts
pnpm scripts:fire-webhook          # Fire test webhooks
pnpm scripts:assert-state          # Assert state checks
pnpm scripts:simulate-merge        # Simulate merge operations
```

## Architecture

### Core Components

**GitHub App (packages/app/)**
- `src/probot.ts` - Main Probot app entry point
- `src/webhooks/` - Webhook handlers for GitHub events (push, PR, comments, workflow runs)
- `src/services/` - Core business logic services:
  - `migrations.ts` - Migration orchestration
  - `plans.ts` - Migration plan parsing and validation
  - `state.ts` - Migration state management
  - `agents.ts` - Agent execution coordination
  - `commands.ts` - Issue comment command parsing
  - `policy-engine.ts` - Safety policy enforcement
- `src/adapters/` - External service adapters:
  - `agents/` - Different agent implementations (Claude CLI, Cursor CLI, etc.)
  - `vcs/` - Version control system integration
- `src/config/` - Configuration schema and validation

**Runner Scripts (packages/runner-scripts/)**
- CLI tools that execute in GitHub Actions to run agents in isolated environments
- `hachiko-invoke.ts` - Invokes agents with migration plans
- `hachiko-open-pr.ts` - Opens pull requests with agent changes
- `hachiko-report.ts` - Reports agent execution results

### Key Concepts

- **Migration Plans**: Markdown files with YAML frontmatter defining multi-step migrations
- **Agents**: Pluggable AI coding tools (Claude CLI, Cursor CLI, etc.) that execute migration steps
- **State Management**: Tracks migration progress and handles rollbacks/conflicts
- **Policy Engine**: Enforces filesystem allowlists and risky change detection
- **Command Interface**: GitHub issue comments control migrations (`/hachi pause`, `/hachi resume`, etc.)

## Configuration

The app expects `.hachiko.yml` in target repositories with migration plan directories, agent configurations, and safety policies.

## Testing

- Uses Vitest for unit and integration testing
- Test files are in `packages/app/test/` with fixtures for GitHub payloads and migration plans
- Mock implementations available in `test/mocks/`
- End-to-end tests simulate full migration workflows

## Development Notes

- Built with Probot framework for GitHub App development
- Uses Zod schemas for configuration validation
- Pino for structured logging
- Gray-matter for parsing migration plan frontmatter
- LaunchDarkly SDK for feature flagging
- Container sandboxing for agent execution security