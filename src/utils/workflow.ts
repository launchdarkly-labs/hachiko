/**
 * Check if a workflow run is a Hachiko agent workflow
 */
export function isHachikoWorkflow(workflowRun: { name: string }): boolean {
  return (
    workflowRun.name === "Hachiko Agent Runner" ||
    workflowRun.name.includes("hachiko") ||
    workflowRun.name.includes("Hachiko")
  )
}

/**
 * Extract Hachiko workflow data from workflow run event
 */
export function extractHachikoWorkflowData(workflowRun: {
  head_commit?: { message: string }
  head_branch?: string
}): { planId: string; stepId: string; chunk: string | undefined } | null {
  // Try to extract from commit message first
  if (workflowRun.head_commit?.message) {
    const match = workflowRun.head_commit.message.match(
      /Hachiko:\s*([^-]+)\s*-\s*([^(]+)(?:\s*\(([^)]+)\))?/
    )

    if (match?.[1] && match[2]) {
      return {
        planId: match[1].trim(),
        stepId: match[2].trim(),
        chunk: match[3]?.trim() || undefined,
      }
    }
  }

  // Fall back to branch name parsing
  if (workflowRun.head_branch) {
    const { parseMigrationBranchName } = require("./git.js")
    return parseMigrationBranchName(workflowRun.head_branch)
  }

  return null
}

/**
 * Generate workflow dispatch payload for agent execution
 */
export function generateAgentDispatchPayload(
  planId: string,
  stepId: string,
  chunk?: string,
  promptConfigRef?: string,
  additionalData?: Record<string, unknown>
): Record<string, unknown> {
  const payload = {
    planId,
    stepId,
    chunk: chunk || undefined,
    promptConfigRef,
    commitMessage: generateCommitMessage(planId, stepId, chunk),
    branchName: generateBranchName(planId, stepId, chunk),
    ...additionalData,
  }

  // Remove undefined values
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
}

/**
 * Generate commit message for migration changes
 */
export function generateCommitMessage(planId: string, stepId: string, chunk?: string): string {
  const chunkSuffix = chunk ? ` (${chunk})` : ""
  return `Hachiko: ${planId} - ${stepId}${chunkSuffix}`
}

/**
 * Generate branch name for migration step
 */
export function generateBranchName(planId: string, stepId: string, chunk?: string): string {
  const chunkSuffix = chunk ? `/${chunk}` : ""
  return `hachi/${planId}/${stepId}${chunkSuffix}`
}
