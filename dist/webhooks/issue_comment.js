import { handleAdoptCommand, handlePauseCommand, handleRebaseCommand, handleResumeCommand, handleRetryCommand, handleSkipCommand, handleStatusCommand, } from "../services/commands.js";
import { parseHachikoCommand } from "../utils/commands.js";
export async function handleIssueComment(context, logger) {
    const { payload } = context;
    const { comment, issue } = payload;
    // Only process comments that start with /hachi
    if (!comment.body.trim().startsWith("/hachi")) {
        return;
    }
    logger.info({
        issueNumber: issue.number,
        commentId: comment.id,
        author: comment.user?.login,
        body: comment.body.slice(0, 100),
    }, "Processing Hachiko command");
    try {
        const command = parseHachikoCommand(comment.body);
        if (!command) {
            await replyWithUsage(context, logger);
            return;
        }
        logger.info({ command }, "Parsed Hachiko command");
        // Dispatch to appropriate command handler
        switch (command.action) {
            case "rebase":
                await handleRebaseCommand(context, command, logger);
                break;
            case "pause":
                await handlePauseCommand(context, command, logger);
                break;
            case "resume":
                await handleResumeCommand(context, command, logger);
                break;
            case "adopt":
                await handleAdoptCommand(context, command, logger);
                break;
            case "status":
                await handleStatusCommand(context, command, logger);
                break;
            case "skip":
                await handleSkipCommand(context, command, logger);
                break;
            case "retry":
                await handleRetryCommand(context, command, logger);
                break;
            default:
                await replyWithUsage(context, logger);
        }
    }
    catch (error) {
        logger.error({ error }, "Failed to handle issue comment");
        await context.octokit.issues.createComment({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            issue_number: context.payload.issue.number,
            body: `❌ **Error processing command**: ${error instanceof Error ? error.message : String(error)}`,
        });
    }
}
async function replyWithUsage(context, logger) {
    const usage = `## Available Hachiko Commands

- \`/hachi status\` - Show current migration status
- \`/hachi pause\` - Pause the current migration
- \`/hachi resume [stepId]\` - Resume migration (optionally from a specific step)
- \`/hachi rebase\` - Rebase open migration PRs
- \`/hachi skip <stepId>\` - Skip a specific step and continue
- \`/hachi retry <stepId>\` - Retry a failed step
- \`/hachi adopt <agent>\` - Switch to a different agent for this migration

For more details, see the [Hachiko documentation](https://github.com/launchdarkly/hachiko#commands).`;
    await context.octokit.issues.createComment({
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        issue_number: context.payload.issue.number,
        body: usage,
    });
    logger.info("Replied with command usage");
}
//# sourceMappingURL=issue_comment.js.map