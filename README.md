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

### 1. Install the GitHub App

```bash
# Install Hachiko on your repository
# TODO (Installation instructions will be added once the app is deployed)
```

### 2. Configure Your Repository

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

### 3. Create a Migration Plan

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

### 4. Activate the Migration

1. Push your migration plan to the default branch
2. Hachiko will create a Migration Issue and Plan Review PR
3. Review and merge the Plan Review PR to activate the migration
4. Watch as Hachiko orchestrates the migration step by step!

## 📚 Documentation

- [Architecture Overview](docs/architecture.md)
- [Configuration Reference](docs/config.md)
- [Migration Plan Format](docs/plan-spec.md)
- [Developer Setup](docs/developer-setup.md)
- [Security Model](docs/security.md)
- [Dogfooding Guide](docs/dogfooding.md)

## 🔧 Commands

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

```bash
# Run end-to-end migration simulation
pnpm scripts:simulate-migration

# Fire test webhooks
pnpm scripts:fire-webhook push examples/migrations/react-class-to-hooks.md
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
