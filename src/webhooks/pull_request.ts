import type { Context } from "probot";
import { loadHachikoConfig } from "../services/config.js";
import { emitNextStep, updateMigrationProgress } from "../services/migrations.js";
import { detectHachikoPR, validateHachikoPR } from "../services/pr-detection.js";
import { getMigrationStateWithDocument } from "../services/state-inference.js";
import { updateDashboardInRepo } from "../services/dashboard.js";
import type { Logger } from "../utils/logger.js";
import { extractMigrationMetadata } from "../utils/pr.js";

export async function handlePullRequest(
  context: Context<"pull_request.closed" | "pull_request.opened" | "pull_request.synchronize">,
  logger: Logger
): Promise<void> {
  const { payload } = context;
  const { pull_request: pr, action } = payload;

  logger.info(
    {
      prNumber: pr.number,
      action,
      merged: pr.merged,
      title: pr.title,
    },
    "Processing pull request event"
  );

  // Check if this is a Hachiko PR using new detection service
  const hachikoPR = detectHachikoPR(pr as any);
  if (!hachikoPR) {
    logger.debug("PR is not managed by Hachiko, skipping");
    return;
  }

  logger.info({ migrationId: hachikoPR.migrationId, action }, "Processing Hachiko migration PR");

  try {
    const config = await loadHachikoConfig(context);

    // Handle different PR actions
    switch (action) {
      case "opened":
        await handlePROpened(context, hachikoPR, config, logger);
        break;
      case "synchronize":
        await handlePRUpdated(context, hachikoPR, config, logger);
        break;
      case "closed":
        if (pr.merged) {
          await handlePRMerged(context, hachikoPR, config, logger);
        } else {
          await handlePRClosed(context, hachikoPR, config, logger);
        }
        break;
    }

    // Update dashboard for all PR events (state may have changed)
    await updateMigrationDashboard(context, hachikoPR.migrationId, logger);
  } catch (error) {
    logger.error(
      { error, migrationId: hachikoPR.migrationId },
      "Failed to handle pull request event"
    );
    throw error;
  }
}

async function handlePROpened(
  context: Context<"pull_request.opened">,
  hachikoPR: { migrationId: string; number: number; title: string },
  _config: any, // TODO: Type this properly
  logger: Logger
): Promise<void> {
  logger.info(
    { migrationId: hachikoPR.migrationId, prNumber: hachikoPR.number },
    "Handling opened migration PR"
  );

  try {
    // Validate PR follows conventions and provide feedback if needed
    const validation = validateHachikoPR(context.payload.pull_request as any);
    if (!validation.isValid && validation.recommendations.length > 0) {
      const comment = `🤖 **Hachiko PR Validation**

I noticed this PR could better follow Hachiko conventions:

${validation.recommendations.map((r) => `- ${r}`).join("\n")}

This will help ensure reliable tracking and dashboard updates.`;

      await context.octokit.issues.createComment({
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        issue_number: hachikoPR.number,
        body: comment,
      });
    }

    logger.info(
      { migrationId: hachikoPR.migrationId, prNumber: hachikoPR.number, validation },
      "Processed opened migration PR"
    );
  } catch (error) {
    logger.error({ error, migrationId: hachikoPR.migrationId }, "Failed to handle opened PR");
    throw error;
  }
}

async function handlePRUpdated(
  context: Context<"pull_request.synchronize">,
  hachikoPR: { migrationId: string; number: number; title: string },
  _config: any, // TODO: Type this properly
  logger: Logger
): Promise<void> {
  logger.info(
    { migrationId: hachikoPR.migrationId, prNumber: hachikoPR.number },
    "Handling updated migration PR"
  );

  // For now, just log. In the future, we might want to re-analyze the PR
  // or update progress based on new commits
}

async function handlePRMerged(
  context: Context<"pull_request.closed">,
  hachikoPR: { migrationId: string; number: number; title: string },
  _config: any, // TODO: Type this properly
  logger: Logger
): Promise<void> {
  logger.info(
    { migrationId: hachikoPR.migrationId, prNumber: hachikoPR.number },
    "Handling merged migration PR"
  );

  try {
    // Legacy support: if this uses the old system, try to extract metadata
    const migrationMeta = extractMigrationMetadata(context.payload.pull_request);
    if (migrationMeta) {
      const { planId, stepId, chunk } = migrationMeta;

      // Update migration progress - mark step as done
      await updateMigrationProgress(
        context,
        planId,
        stepId,
        "completed",
        {
          prNumber: context.payload.pull_request.number,
          mergeCommit: context.payload.pull_request.merge_commit_sha,
          chunk,
        },
        logger
      );

      // Emit repository dispatch for next step/chunk
      await emitNextStep(context, planId, stepId, chunk, logger);
    } else {
      // New system: State will be inferred automatically
      // The dashboard update will handle the state change
      logger.info(
        { migrationId: hachikoPR.migrationId },
        "Merged PR using new state inference system"
      );
    }
  } catch (error) {
    logger.error({ error, migrationId: hachikoPR.migrationId }, "Failed to handle merged PR");
    throw error;
  }
}

async function handlePRClosed(
  context: Context<"pull_request.closed">,
  hachikoPR: { migrationId: string; number: number; title: string },
  _config: any, // TODO: Type this properly
  logger: Logger
): Promise<void> {
  logger.info(
    { migrationId: hachikoPR.migrationId, prNumber: hachikoPR.number },
    "Handling closed (unmerged) migration PR"
  );

  try {
    // Legacy support: if this uses the old system, try to extract metadata
    const migrationMeta = extractMigrationMetadata(context.payload.pull_request);
    if (migrationMeta) {
      const { planId, stepId, chunk } = migrationMeta;

      // Update migration progress - mark step as skipped/ignored
      await updateMigrationProgress(
        context,
        planId,
        stepId,
        "skipped",
        {
          prNumber: context.payload.pull_request.number,
          chunk,
          reason: "PR closed without merging",
        },
        logger
      );

      // Add helpful comment to the Migration Issue
      await addSkippedStepComment(context, planId, stepId, chunk, logger);
    } else {
      // New system: Just log and let dashboard update handle state change
      logger.info(
        { migrationId: hachikoPR.migrationId },
        "Closed unmerged PR using new state inference system"
      );
    }
  } catch (error) {
    logger.error({ error, migrationId: hachikoPR.migrationId }, "Failed to handle closed PR");
    throw error;
  }
}

/**
 * Update migration dashboard when PR events occur
 * This triggers a dashboard refresh to reflect the new state
 */
async function updateMigrationDashboard(
  context: Context,
  migrationId: string,
  logger: Logger
): Promise<void> {
  try {
    // Get current migration state using the new inference system
    const stateInfo = await getMigrationStateWithDocument(
      context as any,
      migrationId,
      "main",
      logger
    );

    logger.info(
      {
        migrationId,
        state: stateInfo.state,
        openPRs: stateInfo.openPRs.length,
        closedPRs: stateInfo.closedPRs.length,
        completedTasks: stateInfo.completedTasks,
        totalTasks: stateInfo.totalTasks,
      },
      "Updated migration state info"
    );

    // Update the dashboard file in the repository
    // This will regenerate the entire dashboard with current states
    await updateDashboardInRepo(context as any, "MIGRATION_DASHBOARD.md", logger);

    logger.info({ migrationId }, "Successfully updated migration dashboard");
  } catch (error) {
    logger.error({ error, migrationId }, "Failed to update migration dashboard");
    // Don't throw - this is not critical for PR processing
  }
}

async function addSkippedStepComment(
  context: Context<"pull_request.closed">,
  planId: string,
  stepId: string,
  chunk: string | undefined,
  logger: Logger
): Promise<void> {
  try {
    // Find the Migration Issue
    const issues = await context.octokit.issues.listForRepo({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      labels: `hachiko:plan:${planId}`,
      state: "open",
    });

    if (issues.data.length === 0) {
      logger.warn({ planId }, "No open Migration Issue found");
      return;
    }

    const migrationIssue = issues.data[0]!; // We know this exists due to length check
    const chunkText = chunk ? ` (${chunk})` : "";
    const prUrl = context.payload.pull_request.html_url;

    const comment = `⚠️ **Step Skipped**: \`${stepId}\`${chunkText}

The pull request for this step was closed without merging: ${prUrl}

**Next Steps:**
- Use \`/hachi resume ${stepId}\` to retry this step with a fresh branch
- Use \`/hachi skip ${stepId}\` to skip this step and continue to the next one
- The migration will remain paused until you take action`;

    await context.octokit.issues.createComment({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      issue_number: migrationIssue.number,
      body: comment,
    });

    logger.info(
      { planId, stepId, issueNumber: migrationIssue.number },
      "Added skipped step comment"
    );
  } catch (error) {
    logger.error({ error, planId, stepId }, "Failed to add skipped step comment");
    // Don't throw - this is not critical
  }
}
