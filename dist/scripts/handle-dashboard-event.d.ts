#!/usr/bin/env node
/**
 * CLI entry point for GitHub Actions workflows to call the extracted
 * TypeScript orchestration logic instead of inline bash.
 *
 * Usage:
 *   node dist/scripts/handle-dashboard-event.js \
 *     --event-type="issue_edit" \
 *     --issue-number="42"
 *
 *   node dist/scripts/handle-dashboard-event.js \
 *     --event-type="pr_closed" \
 *     --pr-number="123" \
 *     --pr-branch="hachiko/my-migration-step-1" \
 *     --pr-merged="true"
 *
 * Environment variables:
 *   GITHUB_TOKEN       — GitHub API token
 *   GITHUB_REPOSITORY  — owner/repo
 */
export {};
//# sourceMappingURL=handle-dashboard-event.d.ts.map