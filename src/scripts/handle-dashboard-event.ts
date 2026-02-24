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

import { Octokit } from "@octokit/rest";
import { createLogger } from "../utils/logger.js";
import {
  parseDashboardCheckboxes,
  determineMigrationAction,
  handlePRClosure,
  applyFrontmatterUpdate,
  isMigrationRunning,
  hasOpenPRsForMigration,
  getTotalSteps,
  detectMigrationFromClosedPR,
} from "../services/workflow-orchestration.js";
import {
  getMigrationStateWithDocument,
} from "../services/state-inference.js";
import type { ContextWithRepository } from "../types/context.js";

const logger = createLogger("handle-dashboard-event");

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg?.slice(prefix.length);
}

function requireArg(name: string): string {
  const value = getArg(name);
  if (!value) {
    console.error(`Missing required argument: --${name}`);
    process.exit(1);
  }
  return value;
}

function buildContext(): ContextWithRepository {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("GITHUB_TOKEN environment variable is required");
    process.exit(1);
  }

  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) {
    console.error("GITHUB_REPOSITORY environment variable is required");
    process.exit(1);
  }

  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    console.error("Invalid GITHUB_REPOSITORY format. Expected: owner/repo");
    process.exit(1);
  }

  const octokit = new Octokit({ auth: token });
  return {
    octokit,
    payload: {
      repository: {
        owner: { login: owner },
        name: repo,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleIssueEdit(context: ContextWithRepository) {
  const issueNumber = parseInt(requireArg("issue-number"), 10);

  // Fetch issue body
  const { data: issue } = await context.octokit.issues.get({
    owner: context.payload.repository.owner.login,
    repo: context.payload.repository.name,
    issue_number: issueNumber,
  });

  const checkboxes = parseDashboardCheckboxes(issue.body ?? "");

  logger.info(
    {
      pending: checkboxes.pending,
      paused: checkboxes.paused,
      inProgress: checkboxes.inProgress,
      restartRequests: checkboxes.restartRequests,
      forceRegeneration: checkboxes.forceRegeneration,
    },
    "Parsed dashboard checkboxes"
  );

  // Check if migration is already running
  const running = await isMigrationRunning(context);

  // Process each checked section
  const dispatches: Array<{ migrationId: string; stepId: string | number; action: string }> = [];

  for (const migrationId of checkboxes.pending) {
    if (running) {
      logger.info({ migrationId }, "Skipping — migration already running");
      continue;
    }
    dispatches.push({ migrationId, stepId: 1, action: "start" });
  }

  for (const migrationId of checkboxes.paused) {
    if (running) {
      logger.info({ migrationId }, "Skipping — migration already running");
      continue;
    }
    const stateInfo = await getMigrationStateWithDocument(context, migrationId, "main", logger);
    const totalSteps = await getTotalSteps(migrationId, context);
    const action = determineMigrationAction({
      migrationId,
      section: "paused",
      stateInfo,
      totalSteps,
    });
    dispatches.push({ migrationId, stepId: action.stepId, action: action.action });
  }

  for (const migrationId of checkboxes.inProgress) {
    if (running) {
      logger.info({ migrationId }, "Skipping — migration already running");
      continue;
    }
    const stateInfo = await getMigrationStateWithDocument(context, migrationId, "main", logger);
    const totalSteps = await getTotalSteps(migrationId, context);
    const action = determineMigrationAction({
      migrationId,
      section: "in-progress",
      stateInfo,
      totalSteps,
    });
    dispatches.push({ migrationId, stepId: action.stepId, action: action.action });
  }

  for (const req of checkboxes.restartRequests) {
    if (running) {
      logger.info({ migrationId: req.migrationId }, "Skipping restart — migration already running");
      continue;
    }
    dispatches.push({ migrationId: req.migrationId, stepId: req.step, action: "restart" });
  }

  // Dispatch workflows
  for (const d of dispatches) {
    logger.info(d, "Dispatching migration execution");
    await context.octokit.actions.createWorkflowDispatch({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      workflow_id: "execute-migration.yml",
      ref: "main",
      inputs: {
        migration_id: d.migrationId,
        step_id: String(d.stepId),
      },
    });
  }

  // Output for GitHub Actions
  console.log(`migrations_triggered=${dispatches.length > 0}`);
  console.log(`force_regeneration=${checkboxes.forceRegeneration}`);
}

async function handlePRClosed(context: ContextWithRepository) {
  const prBranch = requireArg("pr-branch");
  const prMerged = getArg("pr-merged") === "true";
  const prNumber = parseInt(requireArg("pr-number"), 10);

  // Detect migration ID from PR data (supports hachiko/*, cursor/*, devin/* branches)
  const detected = await detectMigrationFromClosedPR(prNumber, prBranch, context);
  if (!detected) {
    logger.info({ prBranch, prNumber }, "Not a hachiko PR — skipping");
    console.log("is_hachiko_pr=false");
    return;
  }

  const { migrationId } = detected;
  logger.info({ migrationId, prMerged, prBranch }, "Hachiko PR closed");

  // Get state and totalSteps from the migration document
  const stateInfo = await getMigrationStateWithDocument(context, migrationId, "main", logger);
  const totalSteps = await getTotalSteps(migrationId, context);

  const result = handlePRClosure({
    migrationId,
    wasMerged: prMerged,
    prBranch,
    stateInfo,
    totalSteps,
  });

  logger.info({ migrationId, ...result }, "PR closure result");

  // Apply frontmatter updates
  switch (result.nextAction) {
    case "advance":
      await applyFrontmatterUpdate(migrationId, "advance", context);
      // Check for open PRs before triggering next step
      if (!(await hasOpenPRsForMigration(migrationId, context))) {
        logger.info({ migrationId, nextStep: result.nextStep }, "Triggering next step");
        await context.octokit.actions.createWorkflowDispatch({
          owner: context.payload.repository.owner.login,
          repo: context.payload.repository.name,
          workflow_id: "execute-migration.yml",
          ref: "main",
          inputs: {
            migration_id: migrationId,
            step_id: String(result.nextStep),
          },
        });
      }
      break;

    case "pause":
      await applyFrontmatterUpdate(migrationId, "pause", context);
      break;

    case "cleanup":
      await applyFrontmatterUpdate(migrationId, "complete", context);
      break;
  }

  console.log("is_hachiko_pr=true");
  console.log(`next_action=${result.nextAction}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const eventType = requireArg("event-type");
  const context = buildContext();

  switch (eventType) {
    case "issue_edit":
      await handleIssueEdit(context);
      break;
    case "pr_closed":
      await handlePRClosed(context);
      break;
    default:
      console.error(`Unknown event type: ${eventType}`);
      process.exit(1);
  }
}

main().catch((error) => {
  logger.error({ error }, "handle-dashboard-event failed");
  console.error("Fatal error:", error);
  process.exit(1);
});
