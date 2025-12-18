# Hachiko 🐕

> **Faithful companion for large-scale code migrations**

Hachiko is a GitHub App that orchestrates technical migrations in large legacy codebases using configurable LLM coding agents. It provides strong guardrails, fast feedback loops, and excellent developer ergonomics for managing complex, multi-step migrations.

## ✨ Features

- **📋 Plan-Driven Migrations**: Define migrations as markdown files with structured frontmatter
- **🤖 Agent Orchestration**: Support for cloud-based AI coding agents (Devin, Cursor, Codex)
- **🛡️ Safety First**: Comprehensive policy engine with filesystem allowlists and risky change detection
- **⚡ Fast Feedback**: Immediate CI checks, linting, testing, and coverage reporting
- **🔄 Smart State Management**: Automatic progress tracking, rollback support, and conflict resolution
- **💬 Interactive Commands**: Control migrations via GitHub issue comments (`/hachi pause`, `/hachi resume`, etc.)
- **🔧 Self-Sufficient**: One command to develop, test, and simulate migrations locally

## 🚀 Quick Start

Hachiko offers two deployment options:

| Feature               | GitHub App                | GitHub Actions               |
| --------------------- | ------------------------- | ---------------------------- |
| **Setup Time**        | 2 minutes                 | 5 minutes                    |
| **Infrastructure**    | Managed service           | Serverless (your repo)       |
| **Best For**          | Organizations, production | Individual repos, dogfooding |
| **Agent Support**     | All agents                | All agents                   |
| **Control Interface** | Issue comments            | Control plane dashboard      |
| **State Management**  | Database                  | Migration documents          |
| **Maintenance**       | Zero                      | Minimal                      |

### Option 1: GitHub App Installation

```bash
# Install Hachiko GitHub App on your repository
# TODO (Installation instructions will be added once the app is deployed)
```

### Option 2: GitHub Actions Setup

For a lightweight, self-contained approach, use Hachiko's GitHub Actions workflows.

**Quick Setup** (5 minutes): Follow the [GitHub Actions Setup Guide](GITHUB-ACTIONS-SETUP.md)

**Summary**:

1. Copy workflows and utilities from this repo
2. Configure repository secrets for cloud agents
3. Create your first migration document
4. Push to main branch and watch the magic happen! ✨

### Shared Configuration

Create `.hachiko.yml` in your repository root:

```yaml
plans:
  directory: migrations/
  filenamePattern: "*.md"

defaults:
  agent: devin
  prParallelism: 1
  requirePlanReview: true

agents:
  devin:
    kind: cloud
    provider: devin
    apiVersion: v1
    timeout: 600
  cursor:
    kind: cloud
    provider: cursor
    timeout: 1200
  codex:
    kind: cloud
    provider: codex
    model: gpt-4-turbo
    maxTokens: 4000
```

### Create a Migration Plan

#### For GitHub App:

Create `migrations/my-migration.md`:

```markdown
---
id: upgrade-dependencies
title: "Upgrade Node.js dependencies to latest versions"
owner: "@your-team"
status: draft
strategy:
  chunkBy: package
  maxOpenPRs: 2
steps:
  - id: audit
    description: "Analyze current dependencies and identify outdated packages"
    expectedPR: false
  - id: upgrade
    description: "Apply dependency upgrades with automated testing"
    expectedPR: true
---

# Dependency Upgrade Migration

This migration will upgrade all Node.js dependencies to their latest stable versions...
```

#### For GitHub Actions:

Create `migrations/my-migration.md`:

```markdown
---
schema_version: 1
id: upgrade-dependencies
title: "Upgrade Node.js dependencies to latest versions"
agent: cursor
status: pending
current_step: 1
total_steps: 2
created: 2024-12-16T10:00:00Z
last_updated: 2024-12-16T10:00:00Z
---

# Dependency Upgrade Migration

This migration will upgrade all Node.js dependencies to their latest stable versions...

## Steps
1. Analyze current dependencies and identify outdated packages
2. Apply dependency upgrades with automated testing
```

### Activate the Migration

#### GitHub App:

1. Push your migration plan to the default branch
2. Hachiko will create a Migration Issue and Plan Review PR
3. Review and merge the Plan Review PR to activate the migration
4. Watch as Hachiko orchestrates the migration step by step!

#### GitHub Actions:

1. Push your migration plan to the main branch
2. GitHub Actions will detect the new migration and create an enhancement PR
3. Review and merge the enhancement PR
4. Check the migration checkbox in the **Control Plane Issue** to start execution
5. Monitor progress as PRs are automatically created for each step!

## 📚 Documentation

- [Architecture Overview](docs/architecture.md)
- [Configuration Reference](docs/config.md)
- [Migration Plan Format](docs/plan-spec.md)
- [Developer Setup](docs/developer-setup.md)
- [Security Model](docs/security.md)
- [Dogfooding Guide](docs/dogfooding.md)
- [GitHub Actions Setup](.projects/github-actions-architecture.md)
- [Phase 1 Validation Plan](.projects/phase1-validation-plan.md)

## 🔧 Troubleshooting

### GitHub Actions Issues

**Workflows not triggering**:

- Ensure workflows are in `.github/workflows/` directory
- Check that GitHub Actions is enabled for your repository
- Verify file permissions and YAML syntax

**Agent API failures**:

- Confirm API keys are set as repository secrets
- Check secret names match workflow requirements:
  - `CURSOR_API_KEY` for Cursor agent
  - `DEVIN_API_KEY` for Devin agent
  - `OPENAI_API_KEY` for Codex agent

**Control plane issue not created**:

- Check workflow logs for API rate limits
- Ensure `GITHUB_TOKEN` has `issues: write` permission
- Manually trigger `control-plane.yml` workflow

**Migration stuck in pending**:

- Verify checkbox was checked in control plane issue
- Check `execute-migration.yml` workflow logs
- Confirm agent execution completed successfully

**Validation failing**:

```bash
# Run diagnostic checks
pnpm validate:phase1

# Check specific migration
pnpm migration validate migrations/your-migration.md

# Verify schema
pnpm migration get your-migration-id
```

## ⚡ GitHub Actions Mode

Hachiko's GitHub Actions implementation provides a lightweight, serverless approach to migration management.

### Control Plane Dashboard

Once set up, Hachiko automatically creates a **Control Plane Issue** that acts like Renovate's dependency dashboard:

```markdown
# 🎛️ Hachiko Migration Control Plane

## 🟡 Pending Migrations
- [ ] `upgrade-dependencies` - Upgrade Node.js dependencies to latest versions
- [ ] `migrate-to-typescript` - Convert JavaScript files to TypeScript

## 🔄 In-Progress Migrations
- `improve-test-coverage` - Improve test coverage ([PR #123](link)) - 2/3 steps completed

## ⏸️ Paused Migrations
- [ ] `refactor-auth` - Refactor authentication system (last attempt: PR #122)
```

### Migration Control

**Start a migration**: Check the checkbox next to a pending migration
**Resume a paused migration**: Check the checkbox next to a paused migration  
**Pause a migration**: Close the migration PR without merging
**Monitor progress**: Watch the dashboard update automatically

### CLI Tools

Manage migrations locally using the CLI:

```bash
# List all migrations
pnpm migration list

# Check migration status
pnpm migration get <migration-id>

# Update migration state
pnpm migration update <migration-id> --status paused

# Validate migration documents
pnpm migration validate migrations/*.md

# Generate control plane issue body
pnpm migration generate-control-plane
```

### Validation

Run Phase 1 validation to ensure everything is set up correctly:

```bash
# Run automated validation checks
pnpm validate:phase1
```

## 🔧 Commands (GitHub App Only)

Control your migrations using GitHub issue comments:

- `/hachi status` - Show current migration status
- `/hachi pause` - Pause the active migration
- `/hachi resume [stepId]` - Resume migration from a specific step
- `/hachi rebase` - Rebase open migration PRs
- `/hachi skip <stepId>` - Skip a specific step
- `/hachi retry <stepId>` - Retry a failed step
- `/hachi adopt <agent>` - Switch to a different agent

## 🏗️ Development

### Prerequisites

- Node.js 22+
- pnpm 9+
- API keys for chosen cloud agents (Devin, Cursor, or OpenAI)

### Setup

```bash
# Clone and install dependencies
git clone https://github.com/launchdarkly/hachiko.git
cd hachiko
pnpm install

# Set up environment variables for cloud agents
export DEVIN_API_KEY="your-devin-api-key"
export CURSOR_API_KEY="your-cursor-api-key"
export OPENAI_API_KEY="your-openai-api-key"

# Build the app
pnpm build

# Run locally with webhook proxy
pnpm dev
```

### Testing

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm coverage

# Lint and format
pnpm lint
pnpm format

# Type check
pnpm typecheck
```

### Dogfooding

#### GitHub App Mode:

```bash
# Run end-to-end migration simulation
pnpm scripts:simulate-migration

# Fire test webhooks
pnpm scripts:fire-webhook push examples/migrations/react-class-to-hooks.md
```

#### GitHub Actions Mode:

```bash
# Validate GitHub Actions setup
pnpm validate:phase1

# Test migration CLI
pnpm migration list
pnpm migration validate migrations/test-simple-validation.md

# Generate control plane issue locally
pnpm migration generate-control-plane

# Test workflow files (requires GitHub CLI)
gh workflow list
gh workflow run detect-migrations.yml
```

## 🛡️ Security

Hachiko takes security seriously:

- **🔒 Least Privilege**: Minimal GitHub App permissions
- **☁️ Cloud-Native Security**: Agents run in secure cloud environments with enterprise SLAs
- **🚫 Filesystem Allowlists**: Strict control over what files can be modified
- **📝 Policy Engine**: Configurable rules for risky change detection
- **🔍 Audit Trail**: Complete history of all migration actions
- **🔑 API Authentication**: Secure token-based authentication with cloud providers

See [Security Model](docs/security.md) for details.

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Ensure all CI checks pass
5. Open a pull request

## 📄 License

[MIT License](LICENSE)

## 🙏 Acknowledgments

- Named after [Hachikō](https://en.wikipedia.org/wiki/Hachik%C5%8D), the legendary loyal dog
- Inspired by large-scale migration challenges at LaunchDarkly
- Built with [Probot](https://probot.github.io/) and [TypeScript](https://typescriptlang.org/)

---

_"Just as Hachikō waited faithfully for his owner, Hachiko faithfully manages your code migrations from start to finish."_ 🐕
