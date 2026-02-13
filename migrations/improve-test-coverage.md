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

- [x] Add tests for `src/webhooks/issue_comment.ts` (already had 100% coverage)
- [x] Add tests for `src/webhooks/workflow_run.ts` (25 comprehensive tests, 100% coverage)
- [x] Add tests for `src/webhooks/push.ts` (fixed existing tests, 25 tests, 100% coverage)
- [x] Mock GitHub API responses properly (using vitest mocks)
- [x] Target: Bring webhooks coverage to 85% (achieved 97.75%)

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
- ~~`src/webhooks/issue_comment.ts`~~ ✅ 100% coverage
- ~~`src/webhooks/workflow_run.ts`~~ ✅ 100% coverage
- ~~`src/webhooks/push.ts`~~ ✅ 100% coverage
- `src/utils/git.ts`
- `src/utils/pr.ts`

## Critical Learnings

### Step 2 Insights

- **Test Exclusions**: The `push.test.ts` file was previously excluded from test runs in `vitest.config.ts` due to implementation mismatch. Fixed by properly mocking file system operations and aligning tests with actual implementation.
- **Error Handling Patterns**: HachikoError instances are caught and handled gracefully (logged and continue) rather than re-thrown, allowing batch processing to continue even when individual items fail.
- **Mock Isolation**: Important to reset mocks between tests using `mockResolvedValue()` vs `mockResolvedValueOnce()` to prevent test interference.
- **Coverage Achievement**: Webhooks coverage jumped from 50.94% to 97.75%, exceeding the 85% target by focusing on comprehensive test scenarios including error paths.
