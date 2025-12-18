---
schema_version: 1
id: add-github-actions-integration
title: GitHub Actions Integration Migration
agent: codex
status: pending
current_step: 1
total_steps: 4
created: 2025-12-17T05:29:08.279Z
last_updated: 2025-12-17T05:29:08.279Z
---

# GitHub Actions Integration Migration

Add support for integrating existing Hachiko agent execution within GitHub Actions workflows.

## Overview

This migration adds GitHub Actions integration support to allow Hachiko to execute cloud agents within CI/CD pipelines while maintaining the existing architecture.

## Background

Current architecture uses GitHub App webhooks for orchestration. This migration adds GitHub Actions as an additional execution environment for specific use cases:

- Repository self-migrations
- CI-triggered code transformations
- Scheduled maintenance tasks

## Migration Steps

### Step 1: Add Actions utilities

- Create `src/actions/` directory
- Add GitHub Actions context parsing
- Add utilities for setting outputs and annotations
- Add environment variable helpers

### Step 2: Create Actions entry points

- Add `src/actions/execute-agent.ts` for agent execution
- Add `src/actions/validate-config.ts` for configuration validation
- Add `src/actions/report-results.ts` for result reporting

### Step 3: Add workflow templates

- Create `.github/workflows/templates/` directory
- Add reusable workflow templates for common migrations
- Add examples for repository consumers

### Step 4: Update documentation

- Add Actions integration guide
- Add examples of workflow usage
- Update README with new capabilities

## Integration Points

- Reuse existing agent adapters
- Maintain policy enforcement
- Support same configuration format
- Provide Actions-specific error handling

## Success Criteria

- Agent execution works in GitHub Actions
- Configuration validation in CI
- Clear documentation and examples
- No disruption to existing GitHub App functionality
