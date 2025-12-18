# 🚀 Hachiko GitHub Actions Setup Guide

This guide walks you through setting up Hachiko's GitHub Actions mode for lightweight, serverless migration management.

## ⚡ Quick Setup (5 minutes)

### 1. Copy Required Files

Copy these files from the Hachiko repository to your project:

```bash
# Required GitHub Actions workflows
.github/workflows/detect-migrations.yml
.github/workflows/control-plane.yml
.github/workflows/execute-migration.yml

# TypeScript utilities
src/config/migration-schema.ts
src/utils/migration-document.ts

# CLI and scripts
scripts/migration-cli.ts
scripts/advance-migration.sh
scripts/pause-migration.sh
scripts/validate-phase1.sh

# Migration directory
migrations/
```

### 2. Install Dependencies

Add these to your `package.json`:

```json
{
  "dependencies": {
    "commander": "^12.1.0",
    "yaml": "^2.6.1"
  },
  "scripts": {
    "migration": "tsx scripts/migration-cli.ts",
    "validate:phase1": "./scripts/validate-phase1.sh"
  }
}
```

### 3. Configure Repository Secrets

Go to **Settings → Secrets and variables → Actions** and add:

```
CURSOR_API_KEY=your-cursor-api-key
DEVIN_API_KEY=your-devin-api-key
OPENAI_API_KEY=your-openai-api-key
```

> **Note**: You only need the API key for the agent(s) you plan to use.

### 4. Create Your First Migration

Create `migrations/example-migration.md`:

```markdown
---
schema_version: 1
id: example-migration
title: "Example Migration for Testing"
agent: mock
status: pending
current_step: 1
total_steps: 1
created: 2024-12-17T10:00:00Z
last_updated: 2024-12-17T10:00:00Z
---

# Example Migration

This is a simple test migration to validate your Hachiko setup.

## What it does
- Creates a test file with timestamp
- Demonstrates the complete migration workflow
- Safe to run on any repository

This migration will be executed by the mock agent for testing.
```

### 5. Push and Test

```bash
# Commit and push to main branch
git add .
git commit -m "Add Hachiko GitHub Actions setup"
git push origin main

# The detect-migrations.yml workflow will trigger automatically
# Check the Actions tab to see it running
```

## 📋 Validation Checklist

After setup, verify everything works:

```bash
# Run automated validation
npm run validate:phase1

# Should output: "🎉 Phase 1 validation PASSED!"
```

**Manual checks**:

- [ ] GitHub Actions workflows appear in `.github/workflows/`
- [ ] Repository secrets are configured
- [ ] Migration CLI works: `npm run migration list`
- [ ] Control plane issue is created automatically
- [ ] Checking migration checkbox triggers execution

## 🎛️ Using the Control Plane

Once set up, Hachiko creates a **Control Plane Issue** that looks like this:

```markdown
# 🎛️ Hachiko Migration Control Plane

## 🟡 Pending Migrations
- [ ] `example-migration` - Example Migration for Testing

## 🔄 In-Progress Migrations
✨ *No active migrations*

## ⏸️ Paused Migrations
✨ *No paused migrations*
```

**To start a migration**: Check the checkbox next to it
**To monitor progress**: Watch for automatic updates and PR links

## 🔧 Common Operations

### Adding a New Migration

1. Create `migrations/your-migration.md` with frontmatter
2. Push to main branch
3. Review the enhancement PR that gets created
4. Merge to add migration to control plane

### Managing Migration State

```bash
# List all migrations
npm run migration list

# Get migration details
npm run migration get your-migration-id

# Update migration status
npm run migration update your-migration-id --status paused
```

### Debugging Issues

```bash
# Check setup
npm run validate:phase1

# Validate specific migration
npm run migration validate migrations/your-migration.md

# Check control plane output
npm run migration generate-control-plane
```

## 🔄 Migration Lifecycle

1. **Create**: Add migration document to `migrations/`
2. **Enhance**: GitHub Actions adds proper frontmatter via PR
3. **Activate**: Check checkbox in control plane issue
4. **Execute**: Agent runs and creates PR with changes
5. **Advance**: Merge PR to move to next step
6. **Complete**: Final step completion marks migration done

## 🛡️ Security Notes

- API keys are stored as encrypted repository secrets
- Workflows only run on main branch for security
- File access is controlled by agent policy configuration
- All changes go through PR review process

## 🚀 Next Steps

- **Test with real agents**: Replace `agent: mock` with `cursor`, `codex`, or `devin`
- **Create complex migrations**: Use multi-step migrations for larger changes
- **Monitor and iterate**: Use control plane to manage ongoing migrations
- **Scale up**: Add more migrations as needed

## 🆘 Need Help?

- Check the [troubleshooting section](README.md#troubleshooting) in the main README
- Review [Phase 1 validation plan](.projects/phase1-validation-plan.md) for comprehensive testing
- Open an issue in the [Hachiko repository](https://github.com/launchdarkly/hachiko/issues)
