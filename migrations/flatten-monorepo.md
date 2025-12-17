---
schema_version: 1
id: flatten-monorepo
title: Flatten Monorepo Structure
agent: cursor
status: pending
current_step: 1
total_steps: 4
created: 2025-12-17T05:29:02.043Z
last_updated: 2025-12-17T05:29:02.043Z
---

# Flatten Monorepo Structure

This migration flattens the current monorepo structure from `packages/app/` to the root directory for better developer experience.

## Overview

The current monorepo structure with `packages/app/` and `packages/runner-scripts/` is causing confusion with commands and scope. The plan is to flatten to a single package structure.

## Migration Steps

### Step 1: Move source files
- Move `packages/app/src/*` to `src/`
- Move `packages/app/test/*` to `test/`
- Move `packages/app/dist/*` to `dist/`

### Step 2: Update package.json
- Merge `packages/app/package.json` into root `package.json`
- Update scripts and dependencies
- Remove workspace configuration

### Step 3: Update configuration files
- Update `tsconfig.json` paths
- Update `.github/workflows/*.yml` to remove `--filter` commands
- Update import paths in source files

### Step 4: Clean up
- Remove `packages/` directory
- Update documentation to reflect new structure

## Expected Changes

- Simpler project structure
- No more `pnpm --filter` commands needed
- Clearer development workflow
- Easier navigation and understanding

## Risks

- Potential import path breakage
- CI/CD workflow adjustments needed
- Documentation updates required