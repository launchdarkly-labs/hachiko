"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProbotApp = createProbotApp;
const logger_js_1 = require("./utils/logger.js");
const issue_comment_js_1 = require("./webhooks/issue_comment.js");
const pull_request_js_1 = require("./webhooks/pull_request.js");
const push_js_1 = require("./webhooks/push.js");
const workflow_run_js_1 = require("./webhooks/workflow_run.js");
const logger = (0, logger_js_1.createLogger)("probot");
function createProbotApp(app) {
    logger.info("Setting up webhook handlers");
    // Push events - detect new/changed plans
    app.on(["push"], async (context) => {
        const requestId = context.id;
        const repoLogger = logger.child({
            requestId,
            repository: context.payload.repository.full_name,
            ref: context.payload.ref,
        });
        try {
            await (0, push_js_1.handlePush)(context, repoLogger);
        }
        catch (error) {
            repoLogger.error({ error }, "Failed to handle push event");
        }
    });
    // Pull request events - track migration step completion
    app.on(["pull_request.closed"], async (context) => {
        const requestId = context.id;
        const repoLogger = logger.child({
            requestId,
            repository: context.payload.repository.full_name,
            prNumber: context.payload.pull_request.number,
            action: context.payload.action,
        });
        try {
            await (0, pull_request_js_1.handlePullRequest)(context, repoLogger);
        }
        catch (error) {
            repoLogger.error({ error }, "Failed to handle pull_request event");
        }
    });
    // Issue comment events - handle commands
    app.on(["issue_comment.created"], async (context) => {
        const requestId = context.id;
        const repoLogger = logger.child({
            requestId,
            repository: context.payload.repository.full_name,
            issueNumber: context.payload.issue.number,
            commentId: context.payload.comment.id,
        });
        try {
            await (0, issue_comment_js_1.handleIssueComment)(context, repoLogger);
        }
        catch (error) {
            repoLogger.error({ error }, "Failed to handle issue_comment event");
        }
    });
    // Workflow run events - track agent execution results
    app.on(["workflow_run.completed"], async (context) => {
        const requestId = context.id;
        const repoLogger = logger.child({
            requestId,
            repository: context.payload.repository.full_name,
            workflowName: context.payload.workflow_run.name,
            conclusion: context.payload.workflow_run.conclusion,
        });
        try {
            await (0, workflow_run_js_1.handleWorkflowRun)(context, repoLogger);
        }
        catch (error) {
            repoLogger.error({ error }, "Failed to handle workflow_run event");
        }
    });
    // Health check endpoint
    app.on(["ping"], async (context) => {
        const repoLogger = logger.child({
            requestId: context.id,
            zen: context.payload.zen,
        });
        repoLogger.info("Received ping - Hachiko is healthy!");
    });
    logger.info("Webhook handlers configured successfully");
}
//# sourceMappingURL=probot.js.map