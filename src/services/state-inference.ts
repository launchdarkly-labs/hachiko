/**
 * Service for inferring migration state from PR activity and task completion
 * Implements the state inference model from the migration plan
 */

import type { ContextWithRepository } from "../types/context.js";
import type { Logger } from "../utils/logger.js";
import { createLogger } from "../utils/logger.js";
import { getOpenHachikoPRs, getClosedHachikoPRs, type HachikoPR } from "./pr-detection.js";
import type { MigrationState } from "../config/migration-schema.js";
import { parseMigrationBranchName } from "../utils/git.js";

export interface MigrationStateInfo {
  state: MigrationState;
  openPRs: HachikoPR[];
  closedPRs: HachikoPR[];
  allTasksComplete: boolean;
  totalTasks: number;
  completedTasks: number;
  currentStep: number;
  lastUpdated: string;
}

/**
 * Get the inferred state of a migration based on PR activity and task completion
 *
 * State inference rules:
 * - "pending": No hachiko PRs have ever been created (not started)
 * - "active": Has open PRs OR has merged PRs (migration in progress)
 * - "paused": No open PRs, but has closed PRs that were NOT merged (agent gave up)
 * - "completed": All tasks checked off in main branch migration doc
 */
export async function getMigrationState(
  context: ContextWithRepository,
  migrationId: string,
  migrationDocContent?: string,
  logger?: Logger
): Promise<MigrationStateInfo> {
  const log = logger || createLogger("state-inference");

  try {
    // Get PR information in parallel
    const [openPRs, closedPRs] = await Promise.all([
      getOpenHachikoPRs(context, migrationId, log),
      getClosedHachikoPRs(context, migrationId, log),
    ]);

    // Get task completion info if migration doc content is provided
    let allTasksComplete = false;
    let totalTasks = 0;
    let completedTasks = 0;

    if (migrationDocContent) {
      const taskInfo = getTaskCompletionInfo(migrationDocContent);
      allTasksComplete = taskInfo.allTasksComplete;
      totalTasks = taskInfo.totalTasks;
      completedTasks = taskInfo.completedTasks;
    }

    // Calculate current step from PR activity
    const currentStep = calculateCurrentStep(openPRs, closedPRs, log);

    // Apply state inference rules
    let state: MigrationState;
    if (allTasksComplete && totalTasks > 0) {
      state = "completed";
    } else if (openPRs.length > 0) {
      state = "active";
    } else if (closedPRs.length > 0) {
      // Sort all closed PRs by creation date (most recent first)
      // Note: We'll need to get creation dates from the GitHub API
      // For now, PR numbers are generally chronological, so we can use those
      const sortedClosedPRs = [...closedPRs].sort((a, b) => b.number - a.number);
      const mostRecentPR = sortedClosedPRs[0];

      if (mostRecentPR?.merged) {
        // Most recent PR was merged - migration is between steps
        state = "active";
      } else {
        // Most recent PR was closed without merging - agent gave up
        state = "paused";
      }
    } else {
      state = "pending"; // No PRs ever created
    }

    const stateInfo: MigrationStateInfo = {
      state,
      openPRs,
      closedPRs,
      allTasksComplete,
      totalTasks,
      completedTasks,
      currentStep,
      lastUpdated: new Date().toISOString(),
    };

    log.info(
      {
        migrationId,
        state,
        openPRs: openPRs.length,
        closedPRs: closedPRs.length,
        mergedPRs: closedPRs.filter((pr) => pr.merged).length,
        nonMergedClosedPRs: closedPRs.filter((pr) => !pr.merged).length,
        completedTasks,
        totalTasks,
        currentStep,
      },
      "Inferred migration state"
    );

    return stateInfo;
  } catch (error) {
    log.error({ error, migrationId }, "Failed to get migration state");
    throw error;
  }
}

/**
 * Calculate current migration step from PR activity
 *
 * Rules (in priority order):
 * - If there are merged PRs, current step is the highest merged step + 1 (takes priority)
 * - If there are open PRs but no merged PRs, current step is the lowest open step number
 * - If only closed (non-merged) PRs, current step is the step of the most recent failed attempt
 * - If no PRs at all, current step is 1 (ready to start)
 */
function calculateCurrentStep(
  openPRs: HachikoPR[],
  closedPRs: HachikoPR[],
  logger?: Logger
): number {
  const log = logger || createLogger("step-calculation");

  // Helper to extract step number from branch name
  function getStepNumber(pr: HachikoPR): number | null {
    // Handle hachiko/{migration-id}-step-{N} format
    const stepMatch = pr.branch.match(/-step-(\d+)(?:-|$)/);
    if (stepMatch && stepMatch[1]) {
      return parseInt(stepMatch[1], 10);
    }
    
    // Fallback to old hachi/{migration-id}/{step-id} format
    const parsed = parseMigrationBranchName(pr.branch);
    if (parsed?.stepId) {
      const legacyStepMatch = parsed.stepId.match(/(\d+)/);
      return legacyStepMatch?.[1] ? parseInt(legacyStepMatch[1], 10) : null;
    }

    return null;
  }

  // First check merged PRs to see what's been completed - this takes priority
  const mergedPRs = closedPRs.filter((pr) => pr.merged);
  if (mergedPRs.length > 0) {
    const mergedSteps = mergedPRs
      .map(getStepNumber)
      .filter((step): step is number => step !== null)
      .sort((a, b) => b - a); // Highest first

    if (mergedSteps.length > 0) {
      const highestMergedStep = mergedSteps[0]!;
      const nextStep = highestMergedStep + 1;
      log.debug({ highestMergedStep, nextStep, mergedSteps }, "Next step after merged PRs (priority)");
      return nextStep;
    }
  }

  // If there are open PRs but no merged PRs, use the lowest open step
  if (openPRs.length > 0) {
    const openSteps = openPRs
      .map(getStepNumber)
      .filter((step): step is number => step !== null)
      .sort((a, b) => a - b);

    if (openSteps.length > 0) {
      const currentStep = openSteps[0]!; // Lowest step number being worked on
      log.debug({ currentStep, openSteps }, "Current step from open PRs");
      return currentStep;
    }
  }

  // Check for failed attempts (closed but not merged)
  const failedPRs = closedPRs.filter((pr) => !pr.merged);
  if (failedPRs.length > 0) {
    // Sort by PR number to get most recent attempt
    const sortedFailedPRs = [...failedPRs].sort((a, b) => b.number - a.number);
    const mostRecentFailedPR = sortedFailedPRs[0];

    if (mostRecentFailedPR) {
      const failedStep = getStepNumber(mostRecentFailedPR);
      if (failedStep) {
        log.debug(
          { failedStep, prNumber: mostRecentFailedPR.number },
          "Current step from most recent failed attempt"
        );
        return failedStep; // Retry the failed step
      }
    }
  }

  // No PRs or unable to determine step - default to step 1
  log.debug({}, "Defaulting to step 1 (no PR activity or step info)");
  return 1;
}

/**
 * Get task completion information from migration document content
 * Analyzes markdown checkboxes to determine completion status
 */
export function getTaskCompletionInfo(migrationDocContent: string): {
  allTasksComplete: boolean;
  totalTasks: number;
  completedTasks: number;
  tasks: Array<{ completed: boolean; text: string }>;
} {
  // Match all markdown checkbox patterns: - [ ] or - [x] or - [X]
  const taskPattern = /^- \[([ xX])\] (.+)$/gm;
  const tasks: Array<{ completed: boolean; text: string }> = [];

  let match;
  while ((match = taskPattern.exec(migrationDocContent)) !== null) {
    const isCompleted = match[1] !== " "; // [x] or [X] means completed
    const text = match[2] || "";
    tasks.push({ completed: isCompleted, text });
  }

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => task.completed).length;
  const allTasksComplete = totalTasks > 0 && totalTasks === completedTasks;

  return {
    allTasksComplete,
    totalTasks,
    completedTasks,
    tasks,
  };
}

/**
 * Get migration document content from GitHub API
 */
export async function getMigrationDocumentContent(
  context: ContextWithRepository,
  migrationId: string,
  ref: string = "main",
  logger?: Logger
): Promise<string | null> {
  const log = logger || createLogger("state-inference");

  try {
    const filePath = `migrations/${migrationId}.md`;

    const response = await context.octokit.repos.getContent({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      path: filePath,
      ref,
    });

    if ("content" in response.data && typeof response.data.content === "string") {
      const content = Buffer.from(response.data.content, "base64").toString("utf-8");
      return content;
    }

    log.warn({ migrationId, filePath, ref }, "Migration document not found or not a file");
    return null;
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && error.status === 404) {
      log.info({ migrationId, ref }, "Migration document not found");
      return null;
    }

    log.error({ error, migrationId, ref }, "Failed to get migration document content");
    throw error;
  }
}

/**
 * Get complete migration state with document content fetched from GitHub
 */
export async function getMigrationStateWithDocument(
  context: ContextWithRepository,
  migrationId: string,
  ref: string = "main",
  logger?: Logger
): Promise<MigrationStateInfo> {
  const log = logger || createLogger("state-inference");

  try {
    const migrationDocContent = await getMigrationDocumentContent(context, migrationId, ref, log);
    return await getMigrationState(context, migrationId, migrationDocContent || undefined, log);
  } catch (error) {
    log.error({ error, migrationId, ref }, "Failed to get migration state with document");
    throw error;
  }
}

/**
 * Get states for multiple migrations in parallel
 */
export async function getMultipleMigrationStates(
  context: ContextWithRepository,
  migrationIds: string[],
  ref: string = "main",
  logger?: Logger
): Promise<Map<string, MigrationStateInfo>> {
  const log = logger || createLogger("state-inference");

  try {
    const statePromises = migrationIds.map(async (migrationId) => {
      try {
        const state = await getMigrationStateWithDocument(context, migrationId, ref, log);
        return [migrationId, state] as const;
      } catch (error) {
        log.warn(
          { error, migrationId },
          "Failed to get migration state with document, falling back to PR-only inference"
        );
        
        // Instead of returning pending, try to infer state from PR activity only
        try {
          const state = await getMigrationState(context, migrationId, undefined, log);
          return [migrationId, state] as const;
        } catch (prError) {
          log.error({ error: prError, migrationId }, "Failed to get state even without document");
          // Only return default state if both document fetch AND PR detection fail
          return [
            migrationId,
            {
              state: "pending" as MigrationState,
              openPRs: [],
              closedPRs: [],
              allTasksComplete: false,
              totalTasks: 0,
              completedTasks: 0,
              currentStep: 1,
              lastUpdated: new Date().toISOString(),
            },
          ] as const;
        }
      }
    });

    const results = await Promise.all(statePromises);

    log.info({ migrationsProcessed: results.length }, "Processed multiple migration states");

    return new Map(results as Array<[string, MigrationStateInfo]>);
  } catch (error) {
    log.error({ error, migrationIds }, "Failed to get multiple migration states");
    throw error;
  }
}

/**
 * Check if a migration document has been updated recently
 * This can be used to detect when agents have made progress
 */
export async function getMigrationDocumentLastUpdated(
  context: ContextWithRepository,
  migrationId: string,
  ref: string = "main",
  logger?: Logger
): Promise<Date | null> {
  const log = logger || createLogger("state-inference");

  try {
    const filePath = `migrations/${migrationId}.md`;

    const commits = await context.octokit.repos.listCommits({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      path: filePath,
      sha: ref,
      per_page: 1,
    });

    if (commits.data.length > 0 && commits.data[0]?.commit.committer?.date) {
      return new Date(commits.data[0].commit.committer.date);
    }

    return null;
  } catch (error) {
    log.error({ error, migrationId, ref }, "Failed to get migration document last updated");
    return null;
  }
}

/**
 * Generate a human-readable summary of migration state
 */
export function getMigrationStateSummary(stateInfo: MigrationStateInfo): string {
  const { state, openPRs, closedPRs, totalTasks, completedTasks } = stateInfo;

  switch (state) {
    case "pending":
      return totalTasks > 0
        ? `Pending (${totalTasks} tasks planned, none started)`
        : "Pending (no PRs opened yet)";

    case "active":
      const prSummary = openPRs.length === 1 ? `1 open PR` : `${openPRs.length} open PRs`;
      const taskSummary = totalTasks > 0 ? ` • ${completedTasks}/${totalTasks} tasks complete` : "";
      return `Active (${prSummary}${taskSummary})`;

    case "paused":
      const closedPrSummary =
        closedPRs.length === 1 ? `1 closed PR` : `${closedPRs.length} closed PRs`;
      const pausedTaskSummary =
        totalTasks > 0 ? ` • ${completedTasks}/${totalTasks} tasks complete` : "";
      return `Paused (${closedPrSummary}, no open PRs${pausedTaskSummary})`;

    case "completed":
      return `Completed (all ${totalTasks} tasks finished)`;

    default:
      return "Unknown state";
  }
}
