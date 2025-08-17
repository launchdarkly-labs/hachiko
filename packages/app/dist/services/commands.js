"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleRebaseCommand = handleRebaseCommand;
exports.handlePauseCommand = handlePauseCommand;
exports.handleResumeCommand = handleResumeCommand;
exports.handleAdoptCommand = handleAdoptCommand;
exports.handleStatusCommand = handleStatusCommand;
exports.handleSkipCommand = handleSkipCommand;
exports.handleRetryCommand = handleRetryCommand;
const commands_js_1 = require("../utils/commands.js");
/**
 * Handle /hachi rebase command
 */
async function handleRebaseCommand(context, command, logger) {
    logger.info({ command }, "Handling rebase command");
    const response = (0, commands_js_1.formatCommandResponse)(command.rawCommand, "info", "Rebase functionality not yet implemented", "This feature will rebase all open Hachiko PRs that are behind the base branch.");
    await context.octokit.issues.createComment({
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        issue_number: context.payload.issue.number,
        body: response,
    });
}
/**
 * Handle /hachi pause command
 */
async function handlePauseCommand(context, command, logger) {
    logger.info({ command }, "Handling pause command");
    const response = (0, commands_js_1.formatCommandResponse)(command.rawCommand, "info", "Pause functionality not yet implemented", "This feature will pause the current migration.");
    await context.octokit.issues.createComment({
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        issue_number: context.payload.issue.number,
        body: response,
    });
}
/**
 * Handle /hachi resume command
 */
async function handleResumeCommand(context, command, logger) {
    logger.info({ command }, "Handling resume command");
    const stepId = command.args[0];
    const details = stepId ? `Will resume from step: ${stepId}` : "Will resume from current step";
    const response = (0, commands_js_1.formatCommandResponse)(command.rawCommand, "info", "Resume functionality not yet implemented", details);
    await context.octokit.issues.createComment({
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        issue_number: context.payload.issue.number,
        body: response,
    });
}
/**
 * Handle /hachi adopt command
 */
async function handleAdoptCommand(context, command, logger) {
    logger.info({ command }, "Handling adopt command");
    const agentName = command.args[0];
    if (!agentName) {
        const response = (0, commands_js_1.formatCommandResponse)(command.rawCommand, "error", "Agent name is required", "Usage: `/hachi adopt <agent-name>`");
        await context.octokit.issues.createComment({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            issue_number: context.payload.issue.number,
            body: response,
        });
        return;
    }
    const response = (0, commands_js_1.formatCommandResponse)(command.rawCommand, "info", "Adopt functionality not yet implemented", `Will switch to agent: ${agentName}`);
    await context.octokit.issues.createComment({
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        issue_number: context.payload.issue.number,
        body: response,
    });
}
/**
 * Handle /hachi status command
 */
async function handleStatusCommand(context, command, logger) {
    logger.info({ command }, "Handling status command");
    // TODO: Get actual migration status
    const status = `## Migration Status

**Current Status**: In Development 🚧

**Next Steps**: 
- Complete Hachiko implementation
- Add proper state tracking
- Implement command handlers

This is a placeholder response while the feature is being developed.`;
    await context.octokit.issues.createComment({
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        issue_number: context.payload.issue.number,
        body: status,
    });
}
/**
 * Handle /hachi skip command
 */
async function handleSkipCommand(context, command, logger) {
    logger.info({ command }, "Handling skip command");
    const stepId = command.args[0];
    if (!stepId) {
        const response = (0, commands_js_1.formatCommandResponse)(command.rawCommand, "error", "Step ID is required", "Usage: `/hachi skip <step-id>`");
        await context.octokit.issues.createComment({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            issue_number: context.payload.issue.number,
            body: response,
        });
        return;
    }
    const response = (0, commands_js_1.formatCommandResponse)(command.rawCommand, "info", "Skip functionality not yet implemented", `Will skip step: ${stepId}`);
    await context.octokit.issues.createComment({
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        issue_number: context.payload.issue.number,
        body: response,
    });
}
/**
 * Handle /hachi retry command
 */
async function handleRetryCommand(context, command, logger) {
    logger.info({ command }, "Handling retry command");
    const stepId = command.args[0];
    if (!stepId) {
        const response = (0, commands_js_1.formatCommandResponse)(command.rawCommand, "error", "Step ID is required", "Usage: `/hachi retry <step-id>`");
        await context.octokit.issues.createComment({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            issue_number: context.payload.issue.number,
            body: response,
        });
        return;
    }
    const response = (0, commands_js_1.formatCommandResponse)(command.rawCommand, "info", "Retry functionality not yet implemented", `Will retry step: ${stepId}`);
    await context.octokit.issues.createComment({
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        issue_number: context.payload.issue.number,
        body: response,
    });
}
//# sourceMappingURL=commands.js.map