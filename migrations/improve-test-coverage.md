---
schema_version: 1
id: improve-test-coverage
title: Improve Test Coverage from 55% to 80%
agent: cursor
status: paused
current_step: 1
total_steps: 3
created: 2024-12-16T10:00:00Z
last_updated: 2025-12-17T06:00:56.235Z
pr_number: 123
branch: hachiko/improve-test-coverage-step-1
error: PR closed without merging
---

# Improve Test Coverage

This migration aims to increase test coverage from the current 55.53% to at least 80% by adding comprehensive unit tests.

## Current State

- Test coverage: 55.53% -> 66.58% (after Step 1)
- Services layer coverage improved to 83.43%
- Integration tests excluded from coverage

## Migration Steps

### Step 1: Add tests for services layer

- [x] Add comprehensive tests for `src/services/agents.ts` (0% -> 100%)
- [x] Add tests for `src/services/policy-engine.ts` (0% -> 98.95%)
- [x] Add tests for `src/services/state.ts` (already at 95.14%)
- [x] Target: Bring services coverage to 90% (achieved: agents.ts 100%, policy-engine.ts 98.95%, state.ts 95.14%)

### Step 2: Add tests for webhooks

- Add tests for `src/webhooks/issue_comment.ts`
- Add tests for `src/webhooks/workflow_run.ts`
- Mock GitHub API responses properly
- Target: Bring webhooks coverage to 85%

### Step 3: Add tests for utilities

- Add comprehensive tests for `src/utils/git.ts`
- Add tests for `src/utils/pr.ts`
- Add tests for `src/utils/workflow.ts`
- Target: Bring utils coverage to 95%

## Success Criteria

- Overall test coverage >= 80%
- All critical paths tested
- CI passes with new tests
- No regression in existing functionality

## Files to Focus On

Priority files with low/missing coverage:

- `src/services/agents.ts`
- `src/services/policy-engine.ts`
- `src/services/state.ts`
- `src/webhooks/issue_comment.ts`
- `src/webhooks/workflow_run.ts`
- `src/utils/git.ts`
- `src/utils/pr.ts`
