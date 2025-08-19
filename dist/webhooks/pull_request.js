import { loadHachikoConfig } from "../services/config.js";
import { emitNextStep, updateMigrationProgress } from "../services/migrations.js";
import { extractMigrationMetadata, isMigrationPR } from "../utils/pr.js";
export async function handlePullRequest(context, logger) {
    const { payload } = context;
    const { pull_request: pr, repository: _repository } = payload;
    logger.info({
        prNumber: pr.number,
        merged: pr.merged,
        title: pr.title,
    }, "Processing pull request closure");
    // Only process Hachiko-managed PRs
    if (!isMigrationPR(pr)) {
        logger.debug("PR is not managed by Hachiko, skipping");
        return;
    }
    try {
        const config = await loadHachikoConfig(context);
        const migrationMeta = extractMigrationMetadata(pr);
        if (!migrationMeta) {
            logger.warn("Could not extract migration metadata from PR");
            return;
        }
        logger.info({ migrationMeta }, "Extracted migration metadata");
        if (pr.merged) {
            await handleMergedPR(context, migrationMeta, config, logger);
        }
        else {
            await handleClosedPR(context, migrationMeta, config, logger);
        }
    }
    catch (error) {
        logger.error({ error }, "Failed to handle pull request event");
        throw error;
    }
}
async function handleMergedPR(context, migrationMeta, _config, // TODO: Type this properly
logger) {
    const { planId, stepId, chunk } = migrationMeta;
    logger.info({ planId, stepId, chunk }, "Handling merged migration PR");
    try {
        // Update migration progress - mark step as done
        await updateMigrationProgress(context, planId, stepId, "completed", {
            prNumber: context.payload.pull_request.number,
            mergeCommit: context.payload.pull_request.merge_commit_sha,
            chunk,
        }, logger);
        // Emit repository dispatch for next step/chunk
        await emitNextStep(context, planId, stepId, chunk, logger);
    }
    catch (error) {
        logger.error({ error, planId, stepId }, "Failed to handle merged PR");
        throw error;
    }
}
async function handleClosedPR(context, migrationMeta, _config, // TODO: Type this properly
logger) {
    const { planId, stepId, chunk } = migrationMeta;
    logger.info({ planId, stepId, chunk }, "Handling closed (unmerged) migration PR");
    try {
        // Update migration progress - mark step as skipped/ignored
        await updateMigrationProgress(context, planId, stepId, "skipped", {
            prNumber: context.payload.pull_request.number,
            chunk,
            reason: "PR closed without merging",
        }, logger);
        // Add helpful comment to the Migration Issue
        await addSkippedStepComment(context, planId, stepId, chunk, logger);
    }
    catch (error) {
        logger.error({ error, planId, stepId }, "Failed to handle closed PR");
        throw error;
    }
}
async function addSkippedStepComment(context, planId, stepId, chunk, logger) {
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
        const migrationIssue = issues.data[0]; // We know this exists due to length check
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
        logger.info({ planId, stepId, issueNumber: migrationIssue.number }, "Added skipped step comment");
    }
    catch (error) {
        logger.error({ error, planId, stepId }, "Failed to add skipped step comment");
        // Don't throw - this is not critical
    }
}
//# sourceMappingURL=pull_request.js.map