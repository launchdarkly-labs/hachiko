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

- Test coverage: 55.53%
- Missing tests for several critical services
- Integration tests excluded from coverage

## Migration Steps

### Step 1: Add tests for services layer

- Add comprehensive tests for `src/services/agents.ts`
- Add tests for `src/services/policy-engine.ts`
- Add tests for `src/services/state.ts`
- Target: Bring services coverage to 90%

### Step 2: Add tests for webhooks

- [x] Add tests for `src/webhooks/issue_comment.ts`
- [x] Add tests for `src/webhooks/workflow_run.ts`
- [x] Mock GitHub API responses properly
- [x] Target: Bring webhooks coverage to 85% (achieved 96.2%)

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
- ~~`src/webhooks/issue_comment.ts`~~ (100% coverage)
- ~~`src/webhooks/workflow_run.ts`~~ (100% coverage)
- `src/utils/git.ts`
- `src/utils/pr.ts`

## Progress Notes

### Step 2 Completion (Webhooks)
- Created comprehensive test suite for `workflow_run.ts` with 27 test cases covering all scenarios
- Fixed and enabled previously excluded `push.test.ts` by correcting mock expectations
- Webhook coverage improved from 73.6% to 96.2%, exceeding 85% target
- Overall coverage improved from 59.7% to 61.46%
- All 471 tests passing
