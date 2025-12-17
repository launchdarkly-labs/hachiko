import type { Probot } from "probot";
import { createLogger } from "./utils/logger.js";
import { handleIssueComment } from "./webhooks/issue_comment.js";
import { handlePullRequest } from "./webhooks/pull_request.js";
import { handlePush } from "./webhooks/push.js";
import { handleWorkflowRun } from "./webhooks/workflow_run.js";

const logger = createLogger("probot");

export function createProbotApp(app: Probot): void {
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
      await handlePush(context, repoLogger);
    } catch (error) {
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
      await handlePullRequest(context, repoLogger);
    } catch (error) {
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
      await handleIssueComment(context, repoLogger);
    } catch (error) {
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
      await handleWorkflowRun(context, repoLogger);
    } catch (error) {
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
