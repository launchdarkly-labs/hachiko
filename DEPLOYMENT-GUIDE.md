# Hachiko Deployment Guide

> **Step-by-step guide for setting up Hachiko on other repositories (like gonfalon)**

## Overview

This guide walks through deploying Hachiko to a new repository after it's been thoroughly tested on the hachiko repository itself.

## Prerequisites

- ✅ Hachiko tested successfully on hachiko repository
- ✅ At least one migration executed end-to-end successfully
- ✅ Cloud agent credentials available (optional)
- ✅ Target repository access and admin permissions

## 🎯 Deployment Options

### Option 1: GitHub App (Recommended for Production)

**Best for**: Organizations, multiple repositories, production use

**Setup Time**: 2-5 minutes per repository
**Maintenance**: Zero ongoing maintenance
**Features**: Full automation, issue comments, state management

```bash
# Once GitHub App is deployed:
# 1. Install Hachiko GitHub App on target repository
# 2. Configure .hachiko.yml
# 3. Create migration plans
# 4. Push and watch magic happen!
```

### Option 2: GitHub Actions (Available Now)

**Best for**: Individual repositories, testing, self-hosted scenarios

**Setup Time**: 10-15 minutes
**Maintenance**: Minimal (occasional workflow updates)
**Features**: Full functionality, self-contained, customizable

## 🔧 GitHub Actions Deployment (Available Now)

### Step 1: Copy Workflow Files

From hachiko repository, copy these files to your target repository:

```bash
# In your target repository (e.g., gonfalon)
mkdir -p .github/workflows

# Copy workflow files from hachiko repo
cp /path/to/hachiko/.github/workflows/detect-migrations.yml .github/workflows/
cp /path/to/hachiko/.github/workflows/migration-dashboard.yml .github/workflows/
cp /path/to/hachiko/.github/workflows/execute-migration.yml .github/workflows/

# Copy utility files
mkdir -p scripts
cp /path/to/hachiko/scripts/migration-cli.js scripts/
cp /path/to/hachiko/scripts/github-actions-utils.js scripts/

# Commit workflow setup
git add .github/workflows/ scripts/
git commit -m "Add Hachiko migration workflows"
git push
```

### Step 2: Configure Repository Secrets

Set up API keys for cloud agents (optional, can start with mock agent):

```bash
# Using GitHub CLI
gh secret set CURSOR_API_KEY --body "your-cursor-api-key"
gh secret set DEVIN_API_KEY --body "your-devin-api-key"
gh secret set OPENAI_API_KEY --body "your-openai-api-key"

# Or use GitHub UI: Settings > Secrets and variables > Actions
```

### Step 3: Create Configuration File

Create `.hachiko.yml` in repository root:

```yaml
plans:
  directory: migrations/
  filenamePattern: "*.md"

defaults:
  agent: mock  # Start with mock, upgrade to cloud agents later
  prParallelism: 1
  requirePlanReview: true

agents:
  mock:
    kind: mock
    successRate: 100
    delay: 2000      # 2 second delay for demo purposes
    modifyFiles: true
  cursor:
    kind: cloud
    provider: cursor
    timeout: 1200
  devin:
    kind: cloud
    provider: devin
    apiVersion: v1
    timeout: 600
  codex:
    kind: cloud
    provider: codex
    model: gpt-4-turbo
    maxTokens: 4000

# Repository-specific policies
policies:
  allowedPaths:
    - "src/**"
    - "lib/**"
    - "docs/**"
    - "*.md"
    - "*.json"
    - "*.yml"
    - "*.yaml"
  blockedPaths:
    - "node_modules/**"
    - ".git/**"
    - "dist/**"
    - "build/**"
    - "*.lock"
  dangerousPatterns:
    - "rm -rf"
    - "sudo"
    - "curl"
    - "wget"
  maxFileSize: 1048576  # 1MB
```

### Step 4: Create Migration Directory

```bash
mkdir migrations

# Add .gitkeep to ensure directory is committed
touch migrations/.gitkeep

git add .hachiko.yml migrations/
git commit -m "Configure Hachiko for this repository"
git push
```

### Step 5: Create First Migration

Create a simple test migration to validate setup:

```markdown
# migrations/test-hachiko-setup.md
---
schema_version: 1
id: test-hachiko-setup
title: "Test Hachiko Setup"
agent: mock
status: pending
current_step: 1
total_steps: 1
created: 2025-01-13T12:00:00Z
last_updated: 2025-01-13T12:00:00Z
---

# Test Hachiko Setup

This migration tests that Hachiko is properly configured and working in this repository.

## Purpose

- Validate workflow triggers
- Test migration dashboard issue creation
- Verify migration execution
- Confirm PR creation and management

## Expected Changes

- Create a simple `hachiko-test.txt` file with timestamp
- Add comment to package.json or README
- No breaking changes

This should complete successfully with the mock agent and validate that all workflows are functioning.
```

### Step 6: Trigger and Validate

```bash
# Add the test migration
git add migrations/test-hachiko-setup.md
git commit -m "Add Hachiko setup test migration"
git push

# This should trigger:
# 1. detect-migrations.yml workflow
# 2. Creation of Migration Dashboard Issue
# 3. Ready for execution when checkbox is checked
```

## 📋 Repository-Specific Configuration

### For gonfalon Repository

Based on gonfalon's structure, customize the configuration:

```yaml
# .hachiko.yml for gonfalon
plans:
  directory: migrations/
  filenamePattern: "*.md"

defaults:
  agent: mock  # Start conservative
  prParallelism: 1
  requirePlanReview: true

# Gonfalon-specific paths (adjust based on actual structure)
policies:
  allowedPaths:
    - "src/**"
    - "components/**"
    - "lib/**"
    - "docs/**"
    - "*.md"
    - "*.json"
    - "package.json"
    - "tsconfig.json"
  blockedPaths:
    - "node_modules/**"
    - ".git/**"
    - "dist/**"
    - "build/**"
    - ".next/**"  # If Next.js
    - "*.lock"
  dangerousPatterns:
    - "rm -rf"
    - "sudo"
    - "npm publish"  # Prevent accidental publishing
    - "yarn publish"
  maxFileSize: 524288  # 512KB (smaller for web projects)

# Repository-specific checks (customize for gonfalon's stack)
checks:
  - name: "Unit Tests"
    command: "npm test"
  - name: "Type Check"
    command: "npm run typecheck"
  - name: "Lint"
    command: "npm run lint"
  - name: "Build"
    command: "npm run build"
```

### Example Gonfalon Migrations

Create migrations relevant to gonfalon:

#### Migration 1: TypeScript Migration

```markdown
---
id: add-typescript-support
title: "Add TypeScript support to JavaScript files"
agent: cursor
strategy:
  chunkBy: directory
  maxOpenPRs: 2
checks:
  - "npm run typecheck"
  - "npm test"
---

# Add TypeScript Support

Convert JavaScript files to TypeScript with proper type annotations...
```

#### Migration 2: Component Updates

```markdown
---
id: modernize-react-components
title: "Modernize React components to use hooks"
agent: devin
strategy:
  chunkBy: component
  maxOpenPRs: 3
---

# Modernize React Components

Update class components to functional components with hooks...
```

## ✅ Validation Checklist

### Initial Setup

- [ ] Workflow files copied and committed
- [ ] `.hachiko.yml` created and customized
- [ ] Repository secrets configured (if using cloud agents)
- [ ] Migration directory created
- [ ] Test migration created

### Functionality Testing

- [ ] Push triggers detect-migrations workflow
- [ ] Migration Dashboard Issue created automatically
- [ ] Migration shows as pending in Migration Dashboard
- [ ] Checking checkbox triggers execution
- [ ] Mock agent execution completes successfully
- [ ] PR created with expected changes
- [ ] Merging PR updates Migration Dashboard

### Production Readiness

- [ ] Real migration planned and tested
- [ ] Cloud agent credentials configured
- [ ] Repository-specific policies verified
- [ ] Team permissions and notifications set up
- [ ] Rollback procedures documented
- [ ] Integration with existing CI/CD confirmed

## 🚀 Production Rollout Strategy

### Phase 1: Mock Agent Validation (Week 1)

- Deploy with mock agent only
- Test with simple, safe migrations
- Validate all workflows and processes
- Train team on migration dashboard usage

### Phase 2: Cloud Agent Integration (Week 2)

- Add cloud agent credentials
- Test with one cloud agent (e.g., Cursor)
- Execute small, reversible migrations
- Monitor performance and costs

### Phase 3: Full Production (Week 3+)

- Enable all desired cloud agents
- Create real migration plans
- Monitor and iterate based on usage
- Expand to additional repositories

## 🐛 Troubleshooting

### Common Issues

**Workflows not triggering**:

- Check `.github/workflows/` files are properly copied
- Verify GitHub Actions is enabled for repository
- Check workflow file permissions and syntax

**Migration Dashboard Issue not created**:

- Check `GITHUB_TOKEN` permissions
- Verify workflow has `issues: write` permission
- Check for API rate limits in workflow logs

**Migration execution fails**:

- Verify agent credentials if using cloud agents
- Check migration document format and validation
- Review execution logs in workflow runs

**Permission errors**:

- Verify `.hachiko.yml` policies are correctly configured
- Check file paths are within allowed paths
- Ensure migration touches only permitted files

### Support and Debugging

```bash
# Enable debug logging in workflows
# Add to workflow environment:
DEBUG: "true"
HACHIKO_LOG_LEVEL: "debug"

# Validate migration documents locally
node scripts/migration-cli.js validate migrations/your-migration.md

# Check configuration validity
node scripts/migration-cli.js config-check
```

## 📞 Support

- **Documentation**: Check TESTING-GUIDE.md for detailed testing procedures
- **Issues**: Create GitHub issues in hachiko repository
- **Questions**: Tag @hachiko-team in repository discussions

---

This deployment guide ensures smooth setup of Hachiko on any new repository with proper validation and gradual rollout.
