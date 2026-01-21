---
schema_version: 1
id: optimize-imports
title: "Optimize TypeScript imports for better tree shaking"
agent: mock
status: pending
current_step: 1
total_steps: 3
created: 2025-12-17T06:15:00Z
last_updated: 2025-12-17T06:15:00Z
---

# Optimize TypeScript Imports

This migration optimizes import statements for better tree shaking and smaller bundle sizes.

## Context

The current codebase has mixed import styles that can affect bundle size and tree shaking efficiency. This migration standardizes imports to:

- Use explicit named imports instead of wildcard imports
- Remove unused imports
- Organize imports consistently
- Improve build performance and output size

## Migration Strategy

1. **Optimize src/ imports**: Convert wildcard imports to named imports in source code
2. **Optimize test/ imports**: Clean up test file imports for consistency
3. **Verify build**: Ensure build size and performance are maintained or improved

## Technical Details

### Current Issues

```typescript
// ❌ Wildcard imports (harder to tree shake)
import * as fs from 'node:fs';
import * as path from 'node:path';

// ❌ Unused imports
import { something, unused } from './utils';

// ❌ Inconsistent organization
import { b } from './b';
import { a } from './a';
import { c } from './c';
```

### Target Format

```typescript
// ✅ Explicit named imports
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// ✅ Only used imports
import { something } from './utils';

// ✅ Organized alphabetically
import { a } from './a';
import { b } from './b';
import { c } from './c';
```

### Import Organization Rules

1. **Node.js built-ins** first (e.g., `node:fs`, `node:path`)
2. **External packages** second (e.g., `express`, `zod`)
3. **Internal modules** third (e.g., `./utils`, `../config`)
4. **Type imports** last (e.g., `import type { ... }`)
5. **Alphabetical order** within each group

## Expected Changes

### Files to Modify

- **src/\*\*/\*.ts**: ~46 TypeScript files
- **test/\*\*/\*.ts**: ~19 test files
- Focus on files with wildcard imports or unused imports

### Build Impact

- **Bundle size**: Should remain same or decrease
- **Tree shaking**: Improved dead code elimination
- **Build time**: Should remain same or improve
- **Type checking**: Should remain same or faster

## Success Criteria

- ✅ No wildcard imports in source code
- ✅ No unused import statements
- ✅ Consistent import organization
- ✅ All tests continue to pass
- ✅ Build succeeds with no errors
- ✅ Bundle size maintained or improved
- ✅ TypeScript compilation successful

## Test Plan

This migration modifies import statements but should not affect runtime behavior:

1. **Unit Tests**: All 262 existing tests should pass
2. **Type Checking**: TypeScript compilation should succeed
3. **Linting**: Import organization should pass linting rules
4. **Build Verification**: Production build should succeed
5. **Bundle Analysis**: Compare before/after bundle sizes

## Risk Assessment

- **Risk Level**: Low-Medium
- **Impact**: Import statements only, no runtime logic changes
- **Rollback**: Simple git revert if any issues arise
- **Testing**: Comprehensive test suite will catch any issues

This migration is excellent for testing Hachiko's multi-step coordination and real code modification capabilities while remaining relatively safe and easily reversible.

## Agent Instructions

When processing this migration:

1. **Analyze existing imports** in each file
2. **Identify optimization opportunities** (wildcards, unused imports)
3. **Apply consistent formatting** according to rules above
4. **Verify imports still resolve** correctly
5. **Test that functionality is preserved**

The agent should be conservative and only change imports that clearly need optimization, preserving any imports that may be used in ways that aren't immediately obvious.
