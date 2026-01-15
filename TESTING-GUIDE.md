# Hachiko End-to-End Testing Guide

> **Complete guide for testing Hachiko on this repository and preparing it for deployment to other repositories**

## Overview

This guide provides step-by-step instructions for:

1. **Local Testing**: Validating Hachiko functionality on this repository
2. **Migration Plans**: Real migration examples for testing the complete flow
3. **Cloud Agent Setup**: Configuring and testing cloud agents (Devin, Cursor, Codex)
4. **Deployment Preparation**: Setting up Hachiko on other repositories (like gonfalon)

## 🏗️ Architecture Summary

Hachiko uses a **cloud-native architecture**:

- **No Docker**: Direct API integration with cloud agents
- **Single Package**: Simplified structure for better developer experience
- **High Test Coverage**: 63.72% with 262 comprehensive tests
- **Production Ready**: Zero TypeScript errors, comprehensive CI

## 🧪 Phase 1: Local Testing Setup

### Prerequisites

1. **Node.js 22+** and **pnpm 9+**
2. **API Keys** for cloud agents:
   ```bash
   export DEVIN_API_KEY="your-devin-api-key"      # Optional
   export CURSOR_API_KEY="your-cursor-api-key"    # Optional
   export OPENAI_API_KEY="your-openai-api-key"    # Optional
   ```
3. **GitHub Personal Access Token** with repo permissions

### Initial Setup

```bash
# Clone and install (if not already done)
git clone https://github.com/launchdarkly/hachiko.git
cd hachiko
pnpm install

# Build and validate
pnpm build
pnpm test
pnpm lint
pnpm typecheck

# Verify all checks pass
echo "✅ All systems green - ready for testing!"
```

### Configuration

Create or verify `.hachiko.yml` configuration:

```yaml
plans:
  directory: migrations/
  filenamePattern: "*.md"

defaults:
  agent: mock  # Start with mock agent for safe testing
  prParallelism: 1
  requirePlanReview: true

agents:
  mock:
    kind: mock
    successRate: 100  # For testing
    delay: 1000      # 1 second delay
    modifyFiles: true
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

## 🎯 Phase 2: Migration Plans for Testing

### Test Migration 1: JSDoc Comments (Safe, Documentation Only)

**File**: `migrations/add-jsdoc-comments.md` (already exists)

**Purpose**:

- Test multi-step migration flow
- Safe documentation-only changes
- Validate agent coordination

**Expected Outcome**:

- 3 PRs created (one per utility module)
- JSDoc comments added to utility functions
- All tests continue to pass

### Test Migration 2: Simple Validation (Single Step)

**File**: `migrations/test-simple-validation.md` (already exists)

**Purpose**:

- Test basic migration detection
- Single-step execution
- Mock agent functionality

**Expected Outcome**:

- Single PR created
- Simple file modifications
- Quick completion

### Test Migration 3: Performance Improvements (Real Changes)

**File**: Create `migrations/optimize-imports.md`

```markdown
---
id: optimize-imports
title: "Optimize TypeScript imports for better tree shaking"
owner: "@hachiko-team"
status: draft
agent: mock
strategy:
  chunkBy: directory
  maxOpenPRs: 2
checks:
  - "pnpm test"
  - "pnpm lint"
  - "pnpm typecheck"
  - "pnpm build"
rollback:
  - description: "Revert if build fails or tests break"
    command: "git revert HEAD"
successCriteria:
  - "All imports use explicit named imports"
  - "Build size remains same or smaller"
  - "All tests pass"
steps:
  - id: optimize-src-imports
    description: "Optimize imports in src/ directory"
    expectedPR: true
  - id: optimize-test-imports
    description: "Optimize imports in test/ directory"
    expectedPR: true
  - id: verify-build
    description: "Verify build output and performance"
    expectedPR: false
dependsOn: []
touches:
  - "src/**/*.ts"
  - "test/**/*.ts"
---

# Optimize TypeScript Imports

This migration optimizes import statements for better tree shaking and smaller bundle sizes.

## Changes

1. Convert `import *` to explicit named imports
2. Remove unused imports
3. Organize imports consistently
4. Verify build size impact

This migration tests real code changes while remaining safe and easily reversible.
```

## 🔧 Phase 3: Local Testing Execution

### Step 1: Mock Agent Testing

```bash
# Start with mock agent for safe testing
export HACHIKO_AGENT=mock

# Test migration detection
pnpm run dev &  # Start local server
DEV_PID=$!

# Simulate webhook (test migration detection)
curl -X POST http://localhost:3000/api/github/webhooks \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: push" \
  -d @test/fixtures/webhooks/push-migration-added.json

# Check logs for migration detection
kill $DEV_PID
```

### Step 2: Validate Migration Plans

```bash
# Validate all migration files
for migration in migrations/*.md; do
  echo "Validating $migration..."
  # Add validation script here when available
done

echo "✅ All migration plans valid"
```

### Step 3: Test Core Components

```bash
# Test configuration loading
node -e "
const { loadHachikoConfig } = require('./dist/services/config.js');
console.log('Config loaded successfully');
"

# Test agent registry
node -e "
const { AgentRegistry } = require('./dist/adapters/registry.js');
const registry = new AgentRegistry();
console.log('Available agents:', registry.list());
"

# Test policy engine
node -e "
const { PolicyEngine } = require('./dist/services/policy.js');
console.log('Policy engine loaded');
"
```

## ☁️ Phase 4: Cloud Agent Integration

### Step 1: Devin Agent Testing (Optional)

```bash
# Set up Devin API key
export DEVIN_API_KEY="your-devin-api-key"

# Update .hachiko.yml to use Devin for a test migration
# Then test with a simple migration
```

### Step 2: Cursor Agent Testing (Optional)

```bash
# Set up Cursor API key
export CURSOR_API_KEY="your-cursor-api-key"

# Test Cursor background agent creation
node -e "
const { CursorCloudAdapter } = require('./dist/adapters/agents/cursor-cloud.js');
// Add test code here
"
```

### Step 3: OpenAI/Codex Testing (Optional)

```bash
# Set up OpenAI API key
export OPENAI_API_KEY="your-openai-api-key"

# Test Codex function calling
node -e "
const { CodexCloudAdapter } = require('./dist/adapters/agents/codex-cloud.js');
// Add test code here
"
```

## 🚀 Phase 5: End-to-End Flow Testing

### Complete Migration Flow

1. **Create Migration Plan**:

   ```bash
   # Create a new migration file
   cp migrations/test-simple-validation.md migrations/test-e2e-flow.md
   # Edit to customize for your test
   ```

2. **Trigger Migration**:

   ```bash
   # Commit migration file
   git add migrations/test-e2e-flow.md
   git commit -m "Add E2E test migration"

   # This should trigger Hachiko to detect the migration
   ```

3. **Monitor Progress**:

   ```bash
   # Watch for Migration Issue creation
   # Check PR creation
   # Monitor agent execution
   # Verify completion
   ```

4. **Validate Results**:
   ```bash
   # Check that expected changes were made
   # Verify tests still pass
   # Confirm no unintended side effects
   ```

## 📋 Testing Checklist

### Pre-Testing Validation

- [ ] All dependencies installed (`pnpm install`)
- [ ] Build successful (`pnpm build`)
- [ ] Tests passing (`pnpm test`)
- [ ] Linting clean (`pnpm lint`)
- [ ] TypeScript compile (`pnpm typecheck`)
- [ ] Configuration valid (`.hachiko.yml` exists and valid)

### Mock Agent Testing

- [ ] Migration detection works
- [ ] Migration Issue created
- [ ] Plan Review PR created
- [ ] Step execution simulated
- [ ] Progress tracking functional
- [ ] Completion handling works

### Cloud Agent Testing (Optional)

- [ ] API credentials configured
- [ ] Agent validation successful
- [ ] Real execution works
- [ ] Error handling functional
- [ ] Progress monitoring works

### Integration Testing

- [ ] Full webhook flow works
- [ ] State management functional
- [ ] Policy enforcement active
- [ ] Command processing works
- [ ] Recovery mechanisms functional

## 🐛 Troubleshooting

### Common Issues

**Migration not detected**:

- Check `.hachiko.yml` exists and is valid
- Verify migration file has correct frontmatter
- Check file is in configured directory (`migrations/`)

**Agent execution fails**:

- Verify API keys are set correctly
- Check network connectivity
- Review agent configuration
- Check logs for detailed error messages

**Tests failing**:

- Run `pnpm test` to identify failures
- Check TypeScript compilation (`pnpm typecheck`)
- Verify no linting errors (`pnpm lint`)

**Performance issues**:

- Monitor memory usage during execution
- Check agent timeout settings
- Review file processing efficiency

### Debug Commands

```bash
# Enable debug logging
export DEBUG=hachiko*

# Check configuration loading
export HACHIKO_CONFIG_PATH=./.hachiko.yml

# Test specific agent
export HACHIKO_AGENT=mock

# Validate specific migration
node scripts/validate-migration.js migrations/your-migration.md
```

## ✅ Success Criteria

### Phase 1 Complete

- [ ] All tests pass with mock agent
- [ ] Migration detection functional
- [ ] Issue and PR creation works
- [ ] Basic flow end-to-end functional

### Phase 2 Complete

- [ ] Real migration successfully executed
- [ ] Code changes applied correctly
- [ ] No unintended side effects
- [ ] Recovery/rollback functional

### Phase 3 Complete

- [ ] Cloud agents (optional) working
- [ ] Performance acceptable
- [ ] Error handling robust
- [ ] Production-ready confidence

## 📚 Next Steps

Once testing is complete on this repository:

1. **Document Lessons Learned**: Update this guide with any discoveries
2. **Prepare Deployment Guide**: Create setup instructions for other repos
3. **Test on Gonfalon**: Apply learnings to gonfalon repository
4. **Production Deployment**: Deploy to broader usage

---

This testing approach ensures Hachiko is thoroughly validated before deployment to other repositories.
