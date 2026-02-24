/**
 * Shared helpers for integration/scenario tests.
 *
 * These simulate the real orchestration chains that handle-dashboard-event.ts
 * would execute, and can be reused across multiple scenario test files.
 */
import { GitHubSimulator } from "../../src/testing/github-simulator.js";
import {
  parseDashboardCheckboxes,
  determineMigrationAction,
  handlePRClosure,
  applyFrontmatterUpdate,
  isMigrationRunning,
  hasOpenPRsForMigration,
} from "../../src/services/workflow-orchestration.js";
import {
  getMigrationState,
  getMigrationDocumentContent,
} from "../../src/services/state-inference.js";

/**
 * Simulate what handle-dashboard-event.ts does for an issue_edit event.
 * This is the real orchestration chain, not a unit test.
 */
export async function simulateIssueEditHandler(sim: GitHubSimulator, issueNumber: number) {
  const ctx = sim.context();
  const owner = ctx.payload.repository.owner.login;
  const repo = ctx.payload.repository.name;

  // 1. Fetch issue body (just like the CLI entry point does)
  const { data: issue } = await ctx.octokit.issues.get({
    owner,
    repo,
    issue_number: issueNumber,
  });

  // 2. Parse checkboxes
  const checkboxes = parseDashboardCheckboxes(issue.body ?? "");

  // 3. Check if already running
  const running = await isMigrationRunning(ctx);

  // 4. Process each section
  const dispatches: Array<{ migrationId: string; stepId: string | number }> = [];

  for (const migrationId of checkboxes.pending) {
    if (running) continue;
    dispatches.push({ migrationId, stepId: 1 });
  }

  for (const migrationId of checkboxes.paused) {
    if (running) continue;
    // This is the real chain: fetch doc content, infer state, determine action
    const docContent = await getMigrationDocumentContent(ctx, migrationId);
    const stateInfo = await getMigrationState(ctx, migrationId, docContent ?? undefined);

    // Need total_steps from frontmatter
    const totalSteps = extractTotalSteps(docContent);

    const action = determineMigrationAction({
      migrationId,
      section: "paused",
      stateInfo,
      totalSteps,
    });
    dispatches.push({ migrationId, stepId: action.stepId });
  }

  for (const migrationId of checkboxes.inProgress) {
    if (running) continue;
    const docContent = await getMigrationDocumentContent(ctx, migrationId);
    const stateInfo = await getMigrationState(ctx, migrationId, docContent ?? undefined);
    const totalSteps = extractTotalSteps(docContent);

    const action = determineMigrationAction({
      migrationId,
      section: "in-progress",
      stateInfo,
      totalSteps,
    });
    dispatches.push({ migrationId, stepId: action.stepId });
  }

  for (const req of checkboxes.restartRequests) {
    if (running) continue;
    dispatches.push({ migrationId: req.migrationId, stepId: req.step });
  }

  // 5. Dispatch workflows
  for (const d of dispatches) {
    await ctx.octokit.actions.createWorkflowDispatch({
      owner,
      repo,
      workflow_id: "execute-migration.yml",
      ref: "main",
      inputs: { migration_id: d.migrationId, step_id: String(d.stepId) },
    });
  }

  return { checkboxes, dispatches };
}

/**
 * Simulate what handle-dashboard-event.ts does for a pr_closed event.
 */
export async function simulatePRClosedHandler(
  sim: GitHubSimulator,
  prNumber: number,
  prBranch: string,
  wasMerged: boolean,
  migrationId: string
) {
  const ctx = sim.context();
  const owner = ctx.payload.repository.owner.login;
  const repo = ctx.payload.repository.name;

  // Fetch document + state (the real chain)
  const docContent = await getMigrationDocumentContent(ctx, migrationId);
  const stateInfo = await getMigrationState(ctx, migrationId, docContent ?? undefined);
  const totalSteps = extractTotalSteps(docContent);

  const result = handlePRClosure({
    migrationId,
    wasMerged,
    prBranch,
    stateInfo,
    totalSteps,
  });

  // Apply side effects
  switch (result.nextAction) {
    case "advance":
      await applyFrontmatterUpdate(migrationId, "advance", ctx);
      if (!(await hasOpenPRsForMigration(migrationId, ctx))) {
        await ctx.octokit.actions.createWorkflowDispatch({
          owner,
          repo,
          workflow_id: "execute-migration.yml",
          ref: "main",
          inputs: { migration_id: migrationId, step_id: String(result.nextStep) },
        });
      }
      break;
    case "pause":
      await applyFrontmatterUpdate(migrationId, "pause", ctx);
      break;
    case "cleanup":
      await applyFrontmatterUpdate(migrationId, "complete", ctx);
      break;
  }

  return result;
}

export function extractTotalSteps(docContent: string | null): number {
  if (!docContent) return 0;
  const match = docContent.match(/total_steps:\s*(\d+)/);
  return match?.[1] ? parseInt(match[1], 10) : 0;
}
