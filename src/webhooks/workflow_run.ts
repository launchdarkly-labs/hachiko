import type { Context } from "probot"
import { updateChecksStatus } from "../services/checks.js"
import { updateMigrationProgress } from "../services/migrations.js"
import type { Logger } from "../utils/logger.js"
import { extractHachikoWorkflowData, isHachikoWorkflow } from "../utils/workflow.js"

export async function handleWorkflowRun(
  context: Context<"workflow_run.completed">,
  logger: Logger
): Promise<void> {
  const { payload } = context
  const { workflow_run: workflowRun } = payload

  // Only process Hachiko agent workflows
  if (!isHachikoWorkflow(workflowRun)) {
    logger.debug({ workflowName: workflowRun.name }, "Ignoring non-Hachiko workflow")
    return
  }

  logger.info(
    {
      workflowName: workflowRun.name,
      conclusion: workflowRun.conclusion,
      runId: workflowRun.id,
    },
    "Processing Hachiko workflow completion"
  )

  try {
    const workflowData = extractHachikoWorkflowData(workflowRun)

    if (!workflowData) {
      logger.warn("Could not extract Hachiko workflow data")
      return
    }

    logger.info({ workflowData }, "Extracted workflow data")

    const { planId: _planId, stepId: _stepId, chunk: _chunk } = workflowData

    // Update Checks API with results
    await updateChecksStatus(context, workflowRun, workflowData, logger)

    if (workflowRun.conclusion === "success") {
      await handleSuccessfulRun(context, workflowData, logger)
    } else {
      await handleFailedRun(context, workflowData, workflowRun, logger)
    }
  } catch (error) {
    logger.error({ error }, "Failed to handle workflow run event")
    throw error
  }
}

async function handleSuccessfulRun(
  context: Context<"workflow_run.completed">,
  workflowData: { planId: string; stepId: string; chunk: string | undefined },
  logger: Logger
): Promise<void> {
  const { planId, stepId, chunk } = workflowData

  logger.info({ planId, stepId, chunk }, "Handling successful agent run")

  try {
    // The agent runner should have already opened/updated a PR
    // We just need to update the Migration Issue with progress
    await updateMigrationProgress(
      context,
      planId,
      stepId,
      "awaiting-review",
      {
        workflowRunId: context.payload.workflow_run.id,
        chunk,
        conclusion: "success",
      },
      logger
    )
  } catch (error) {
    logger.error({ error, planId, stepId }, "Failed to handle successful run")
    throw error
  }
}

async function handleFailedRun(
  context: Context<"workflow_run.completed">,
  workflowData: { planId: string; stepId: string; chunk: string | undefined },
  workflowRun: any, // TODO: Type this properly
  logger: Logger
): Promise<void> {
  const { planId, stepId, chunk } = workflowData

  logger.info(
    {
      planId,
      stepId,
      chunk,
      conclusion: workflowRun.conclusion,
    },
    "Handling failed agent run"
  )

  try {
    // Update migration progress to failed state
    await updateMigrationProgress(
      context,
      planId,
      stepId,
      "failed",
      {
        workflowRunId: workflowRun.id,
        chunk,
        conclusion: workflowRun.conclusion,
        failureReason: await extractFailureReason(context, workflowRun, logger),
      },
      logger
    )

    // Add failure comment to Migration Issue
    await addFailureComment(context, workflowData, workflowRun, logger)
  } catch (error) {
    logger.error({ error, planId, stepId }, "Failed to handle failed run")
    throw error
  }
}

async function extractFailureReason(
  context: Context<"workflow_run.completed">,
  workflowRun: any, // TODO: Type this properly
  logger: Logger
): Promise<string> {
  try {
    // Get workflow run logs to extract failure reason
    const jobs = await context.octokit.actions.listJobsForWorkflowRun({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      run_id: workflowRun.id,
    })

    const failedJobs = jobs.data.jobs.filter((job) => job.conclusion === "failure")

    if (failedJobs.length > 0) {
      const failedJob = failedJobs[0]! // We know this exists due to length check
      return `Job "${failedJob.name}" failed. See [workflow run](${workflowRun.html_url}) for details.`
    }

    return `Workflow failed with conclusion: ${workflowRun.conclusion}`
  } catch (error) {
    logger.error({ error }, "Failed to extract failure reason")
    return `Workflow failed with conclusion: ${workflowRun.conclusion}`
  }
}

async function addFailureComment(
  context: Context<"workflow_run.completed">,
  workflowData: { planId: string; stepId: string; chunk: string | undefined },
  workflowRun: any, // TODO: Type this properly
  logger: Logger
): Promise<void> {
  try {
    const { planId, stepId, chunk } = workflowData

    // Find the Migration Issue
    const issues = await context.octokit.issues.listForRepo({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      labels: `hachiko:plan:${planId}`,
      state: "open",
    })

    if (issues.data.length === 0) {
      logger.warn({ planId }, "No open Migration Issue found for failure comment")
      return
    }

    const migrationIssue = issues.data[0]! // We know this exists due to length check
    const chunkText = chunk ? ` (${chunk})` : ""

    const comment = `❌ **Step Failed**: \`${stepId}\`${chunkText}

The agent workflow failed during execution. See the [workflow run](${workflowRun.html_url}) for detailed logs.

**Conclusion**: ${workflowRun.conclusion}

**Next Steps:**
- Review the workflow logs to understand the failure
- Use \`/hachi retry ${stepId}\` to retry this step
- Use \`/hachi skip ${stepId}\` to skip this step and continue`

    await context.octokit.issues.createComment({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      issue_number: migrationIssue.number,
      body: comment,
    })

    logger.info({ planId, stepId, issueNumber: migrationIssue.number }, "Added failure comment")
  } catch (error) {
    logger.error({ error }, "Failed to add failure comment")
    // Don't throw - this is not critical
  }
}
