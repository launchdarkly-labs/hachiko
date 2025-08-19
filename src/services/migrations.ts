import type { ContextWithRepository } from "../types/context.js"
import type { Logger } from "../utils/logger.js"
import { generateAgentDispatchPayload } from "../utils/workflow.js"

/**
 * Update migration progress in the Migration Issue
 */
export async function updateMigrationProgress(
  context: ContextWithRepository,
  planId: string,
  stepId: string,
  status: string,
  metadata?: Record<string, unknown>,
  logger?: Logger
): Promise<void> {
  logger?.info({ planId, stepId, status }, "Updating migration progress")

  try {
    // Find the Migration Issue
    const issues = await context.octokit.issues.listForRepo({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      labels: `hachiko:plan:${planId}`,
      state: "open",
    })

    if (issues.data.length === 0) {
      logger?.warn({ planId }, "No open Migration Issue found")
      return
    }

    const migrationIssue = issues.data[0]! // We know this exists due to length check

    // Update issue labels to reflect current status
    const currentLabels = migrationIssue.labels.map((label) =>
      typeof label === "string" ? label : label.name
    )

    const updatedLabels = currentLabels
      .filter(
        (label): label is string =>
          typeof label === "string" && !label.startsWith("hachiko:status:")
      )
      .concat(`hachiko:status:${status}`)

    await context.octokit.issues.update({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      issue_number: migrationIssue.number,
      labels: updatedLabels,
    })

    // Add progress comment
    const comment = generateProgressComment(stepId, status, metadata)

    await context.octokit.issues.createComment({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      issue_number: migrationIssue.number,
      body: comment,
    })

    logger?.info(
      {
        planId,
        stepId,
        status,
        issueNumber: migrationIssue.number,
      },
      "Updated migration progress"
    )
  } catch (error) {
    logger?.error({ error, planId, stepId }, "Failed to update migration progress")
    throw error
  }
}

/**
 * Emit repository dispatch event for next migration step
 */
export async function emitNextStep(
  context: ContextWithRepository,
  planId: string,
  completedStepId: string,
  chunk?: string,
  logger?: Logger
): Promise<void> {
  logger?.info({ planId, completedStepId, chunk }, "Emitting next step")

  try {
    // TODO: Load plan to determine next step
    // For now, this is a placeholder implementation

    const payload = generateAgentDispatchPayload(
      planId,
      "next-step", // TODO: Calculate actual next step
      chunk,
      `hachiko_prompts_${planId}_${completedStepId}` // TODO: Proper prompt config ref
    )

    await context.octokit.repos.createDispatchEvent({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      event_type: "hachiko.run",
      client_payload: payload,
    })

    logger?.info({ planId, payload }, "Emitted repository dispatch event")
  } catch (error) {
    logger?.error({ error, planId, completedStepId }, "Failed to emit next step")
    throw error
  }
}

/**
 * Generate a progress comment for the Migration Issue
 */
function generateProgressComment(
  stepId: string,
  status: string,
  metadata?: Record<string, unknown>
): string {
  const emoji = getStatusEmoji(status)
  const timestamp = new Date().toISOString()

  let comment = `${emoji} **Step Update**: \`${stepId}\` → \`${status}\`\n\n`

  if (metadata) {
    comment += "**Details:**\n"
    for (const [key, value] of Object.entries(metadata)) {
      if (value !== undefined) {
        comment += `- ${key}: ${formatMetadataValue(value)}\n`
      }
    }
    comment += "\n"
  }

  comment += `*Updated at ${timestamp}*`

  return comment
}

/**
 * Get emoji for migration status
 */
function getStatusEmoji(status: string): string {
  switch (status) {
    case "queued":
      return "⏳"
    case "running":
      return "🔄"
    case "awaiting-review":
      return "👀"
    case "completed":
      return "✅"
    case "failed":
      return "❌"
    case "skipped":
      return "⏭️"
    case "paused":
      return "⏸️"
    default:
      return "ℹ️"
  }
}

/**
 * Format metadata values for display
 */
function formatMetadataValue(value: unknown): string {
  if (typeof value === "string") {
    // If it looks like a URL, make it a link
    if (value.startsWith("http")) {
      return `[Link](${value})`
    }
    return value
  }

  if (typeof value === "number") {
    return value.toString()
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No"
  }

  return JSON.stringify(value)
}
