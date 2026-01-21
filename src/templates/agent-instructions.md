# Hachiko Agent Instructions Template

This template provides standard instructions for AI agents working on Hachiko migrations using the new state inference system.

## Template Variables

- `{migration.id}` - The unique migration identifier
- `{migration.title}` - Human-readable migration title
- `{migration.filePath}` - Path to the migration document
- `{repository.owner}` - Repository owner
- `{repository.name}` - Repository name

## Standard Instructions

When working on migration "{migration.id}":

### 1. Branch Creation

Create a branch using one of these naming patterns:
- **Primary pattern**: `hachiko/{migration.id}`
- **Descriptive pattern**: `hachiko/{migration.id}-description`

Example:
```bash
git checkout -b hachiko/{migration.id}
```

### 2. Pull Request Creation

When creating your PR, ensure it follows these conventions for reliable tracking:

#### Required PR Elements:

1. **Branch naming**: Already done if you followed step 1
2. **PR title**: Must contain `[{migration.id}]` somewhere in the title
3. **PR labels**: Add the label `hachiko:migration`

#### Example PR Title:
```
[{migration.id}] Implement React class to hooks migration - simple components
```

#### Example PR Labels:
- `hachiko:migration`
- `migration`
- `automated`

#### PR Description Template:
```markdown
## Migration: {migration.title}

This PR is part of the migration `{migration.id}`.

**Migration Document**: [{migration.id}]({migration.filePath})

### Tasks Completed in this PR:
- [ ] Task 1 description
- [ ] Task 2 description
- [ ] Task 3 description

### Quality Checklist:
- [ ] Tests pass
- [ ] Linting passes  
- [ ] Type checking passes
- [ ] No unintended side effects
- [ ] Changes reviewed and ready to merge

---
*This PR is part of an automated Hachiko migration. The system will automatically track progress and update the migration dashboard.*
```

### 3. Migration Document Updates

**IMPORTANT**: Update the migration document in the same PR to track your progress.

#### What to Update:
- ✅ **Check off completed tasks**: Change `- [ ]` to `- [x]` for completed items
- ✅ **Add new tasks if discovered**: Use the same checkbox format

#### What NOT to Update:
- ❌ **DO NOT modify frontmatter** (the YAML section at the top)
- ❌ **DO NOT change** `id`, `title`, `agent`, or `created` fields
- ❌ **DO NOT add** status, current_step, or other state fields

#### Example Task Updates:
```markdown
## Tasks
- [x] Add JSDoc to utility functions in `src/utils/` ← Mark as complete
- [x] Add JSDoc to helper functions in `src/helpers/` ← Mark as complete  
- [ ] Update TypeScript config for JSDoc validation ← Still pending
- [ ] Update documentation with JSDoc examples ← Still pending
```

### 4. Quality Gates

Before marking tasks complete, ensure:

1. **Tests pass**: Run the test suite and verify no regressions
2. **Linting passes**: Code follows project style guidelines  
3. **Types check**: No TypeScript errors introduced
4. **Build succeeds**: Project builds without errors

### 5. How State Tracking Works

The system automatically:
- **Detects your PR** using branch name, labels, and title
- **Updates the migration dashboard** when PR events occur (open/close/merge)
- **Infers migration state** from PR activity and task completion:
  - `pending`: No PRs opened yet
  - `active`: Has open PRs
  - `paused`: All PRs closed, but tasks not complete  
  - `completed`: All tasks checked off and merged to main

### 6. Multiple PRs for One Migration

If your migration needs multiple PRs:

1. **Use descriptive branch names**: `hachiko/{migration.id}-component1`, `hachiko/{migration.id}-component2`
2. **Include migration ID in all PR titles**: `[{migration.id}] Component 1 changes`
3. **Add labels to all PRs**: `hachiko:migration`
4. **Update tasks incrementally**: Check off tasks as they're completed across PRs

### 7. Best Practices

#### Do:
- ✅ Create focused, reviewable PRs
- ✅ Update migration document tasks as you complete them
- ✅ Follow naming conventions for reliable tracking
- ✅ Add meaningful PR descriptions
- ✅ Test thoroughly before marking tasks complete

#### Don't:
- ❌ Modify migration document frontmatter
- ❌ Create PRs without proper identification (branch/label/title)
- ❌ Mark tasks complete before they're actually done
- ❌ Skip quality gates (tests, linting, types)
- ❌ Create overly large PRs that are hard to review

### 8. Troubleshooting

If the dashboard doesn't update or your PR isn't being tracked:

1. **Check PR identification**:
   - Branch starts with `hachiko/{migration.id}`
   - Title contains `[{migration.id}]`  
   - Has label `hachiko:migration`

2. **Verify migration document**:
   - File exists at expected path
   - Frontmatter has correct `id` field
   - Tasks use proper checkbox format

3. **Check recent activity**:
   - Dashboard updates on PR events (open/close/merge)
   - Allow a few minutes for processing

### 9. Support

If you encounter issues:
- Check the migration dashboard at `MIGRATION_DASHBOARD.md`
- Review PR validation comments for convention feedback
- Contact the platform team for Hachiko-specific issues

---

**Remember**: The new system automatically tracks your progress through PR activity and task completion. Focus on doing good work and following conventions - the system handles the rest!