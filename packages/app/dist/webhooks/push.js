"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handlePush = handlePush;
const config_js_1 = require("../services/config.js");
const issues_js_1 = require("../services/issues.js");
const plans_js_1 = require("../services/plans.js");
const errors_js_1 = require("../utils/errors.js");
const git_js_1 = require("../utils/git.js");
async function handlePush(context, logger) {
    const { payload } = context;
    const { repository, commits, ref } = payload;
    // Only process pushes to the default branch
    if (!(0, git_js_1.isDefaultBranch)(ref, repository.default_branch)) {
        logger.debug({ ref, defaultBranch: repository.default_branch }, "Ignoring push to non-default branch");
        return;
    }
    logger.info({
        commits: commits.length,
        pusher: payload.pusher?.name,
        headCommit: payload.head_commit?.id,
    }, "Processing push to default branch");
    try {
        // Load repository configuration
        const config = await (0, config_js_1.loadHachikoConfig)(context);
        // Extract changed files from commits
        const changedFiles = (0, git_js_1.extractChangedFiles)(commits);
        logger.debug({ changedFiles: changedFiles.length }, "Extracted changed files");
        // Filter for migration plan files
        const planDirectory = config.plans.directory;
        const changedPlans = changedFiles.filter((file) => file.startsWith(planDirectory) && file.endsWith(".md"));
        if (changedPlans.length === 0) {
            logger.debug("No migration plans changed in this push");
            return;
        }
        logger.info({ changedPlans }, "Found changed migration plans");
        // Process each changed plan
        for (const planPath of changedPlans) {
            try {
                await processPlanChange(context, planPath, config, logger);
            }
            catch (error) {
                logger.error({ error, planPath }, "Failed to process plan change");
                // Continue processing other plans even if one fails
                if (error instanceof errors_js_1.HachikoError) {
                    // TODO: Create issue comment with error details
                    continue;
                }
                throw error;
            }
        }
    }
    catch (error) {
        logger.error({ error }, "Failed to handle push event");
        throw error;
    }
}
async function processPlanChange(context, planPath, config, // TODO: Type this properly
logger) {
    logger.info({ planPath }, "Processing plan change");
    try {
        // Get the plan file content from the repository
        const fileContent = await context.octokit.repos.getContent({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            path: planPath,
            ref: context.payload.head_commit?.id || context.payload.after,
        });
        if (Array.isArray(fileContent.data) || fileContent.data.type !== "file") {
            const dataType = Array.isArray(fileContent.data) ? "array" : fileContent.data.type;
            throw new errors_js_1.HachikoError(`Expected file but got ${dataType}`, "INVALID_FILE_TYPE");
        }
        // Decode base64 content
        const content = Buffer.from(fileContent.data.content, "base64").toString("utf-8");
        // Write content to a temporary file and parse it
        const tempPath = `/tmp/${planPath.replace(/[^a-zA-Z0-9]/g, "_")}`;
        await require("fs").promises.writeFile(tempPath, content);
        const parsed = await (0, plans_js_1.parsePlanFile)(tempPath);
        if (!parsed.isValid) {
            logger.warn({ errors: parsed.errors }, "Plan file has validation errors");
            // TODO: Create issue comment with validation errors
            return;
        }
        const { plan } = parsed;
        // Check if this is a new plan or an existing one
        const isNewPlan = await isNewMigrationPlan(context, plan.id, logger);
        if (isNewPlan) {
            logger.info({ planId: plan.id }, "Detected new migration plan");
            // Create Migration Issue
            await (0, issues_js_1.createMigrationIssue)(context, plan, config, logger);
            // Create Plan Review PR if required
            if (config.defaults.requirePlanReview) {
                await (0, issues_js_1.createPlanReviewPR)(context, plan, config, logger);
            }
        }
        else {
            logger.info({ planId: plan.id }, "Detected changes to existing migration plan");
            // Update existing Migration Issue
            // TODO: Implement updateMigrationIssue
            logger.debug("TODO: Update existing migration issue");
        }
    }
    catch (error) {
        logger.error({ error, planPath }, "Failed to process plan change");
        throw error;
    }
}
async function isNewMigrationPlan(context, planId, logger) {
    try {
        // Search for existing issues with the migration plan label
        const issues = await context.octokit.issues.listForRepo({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            labels: `hachiko:plan:${planId}`,
            state: "all",
        });
        const hasExistingIssue = issues.data.length > 0;
        logger.debug({ planId, existingIssues: issues.data.length }, "Checked for existing migration issues");
        return !hasExistingIssue;
    }
    catch (error) {
        logger.error({ error, planId }, "Failed to check for existing migration plan");
        // Assume it's new to avoid blocking
        return true;
    }
}
//# sourceMappingURL=push.js.map