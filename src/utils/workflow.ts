/**
 * Checks if a GitHub Actions workflow run belongs to the Hachiko agent system.
 *
 * A workflow is identified as a Hachiko workflow if its name matches
 * "Hachiko Agent Runner" or contains "hachiko" (case-insensitive).
 *
 * @param workflowRun - The workflow run object to check
 * @param workflowRun.name - The name of the workflow
 * @returns True if the workflow is a Hachiko agent workflow, false otherwise
 * @example
 * ```typescript
 * isHachikoWorkflow({ name: 'Hachiko Agent Runner' }); // Returns: true
 * isHachikoWorkflow({ name: 'CI Checks' }); // Returns: false
 * ```
 */
export function isHachikoWorkflow(workflowRun: { name: string }): boolean {
  return (
    workflowRun.name === "Hachiko Agent Runner" ||
    workflowRun.name.includes("hachiko") ||
    workflowRun.name.includes("Hachiko")
  );
}

/**
 * Extracts migration metadata from a Hachiko workflow run event.
 *
 * This function attempts two extraction methods:
 * 1. Parses the head commit message for the pattern "Hachiko: {planId} - {stepId} ({chunk})"
 * 2. Falls back to parsing the branch name using the Hachiko branch naming convention
 *
 * @param workflowRun - The workflow run event object
 * @param workflowRun.head_commit - Optional commit object with the commit message
 * @param workflowRun.head_branch - Optional branch name associated with the workflow run
 * @returns An object with planId, stepId, and optional chunk, or null if no metadata can be extracted
 * @example
 * ```typescript
 * extractHachikoWorkflowData({
 *   head_commit: { message: 'Hachiko: add-jsdoc - step-1' }
 * });
 * // Returns: { planId: 'add-jsdoc', stepId: 'step-1', chunk: undefined }
 *
 * extractHachikoWorkflowData({ head_branch: 'hachi/add-jsdoc/step-1' });
 * // Returns: { planId: 'add-jsdoc', stepId: 'step-1', chunk: undefined }
 *
 * extractHachikoWorkflowData({ head_branch: 'feature/unrelated' });
 * // Returns: null
 * ```
 */
export function extractHachikoWorkflowData(workflowRun: {
  head_commit?: { message: string };
  head_branch?: string;
}): { planId: string; stepId: string; chunk: string | undefined } | null {
  // Try to extract from commit message first
  if (workflowRun.head_commit?.message) {
    const match = workflowRun.head_commit.message.match(
      /Hachiko:\s*([^-]+)\s*-\s*([^(]+)(?:\s*\(([^)]+)\))?/
    );

    if (match?.[1] && match[2]) {
      return {
        planId: match[1].trim(),
        stepId: match[2].trim(),
        chunk: match[3]?.trim() || undefined,
      };
    }
  }

  // Fall back to branch name parsing
  if (workflowRun.head_branch) {
    const { parseMigrationBranchName } = require("./git.js");
    return parseMigrationBranchName(workflowRun.head_branch);
  }

  return null;
}

/**
 * Generates a workflow dispatch payload for triggering an agent execution.
 *
 * Constructs a payload object containing all necessary fields for dispatching
 * an agent workflow, including auto-generated commit messages and branch names.
 * Undefined values are stripped from the final payload.
 *
 * @param planId - The unique identifier for the migration plan
 * @param stepId - The identifier for the specific step within the migration
 * @param chunk - Optional chunk identifier for large migrations split into parts
 * @param promptConfigRef - Optional reference to the prompt configuration version
 * @param additionalData - Optional extra fields to include in the payload
 * @returns A payload object suitable for workflow dispatch, with no undefined values
 * @example
 * ```typescript
 * generateAgentDispatchPayload('add-jsdoc', 'step-1');
 * // Returns: {
 * //   planId: 'add-jsdoc',
 * //   stepId: 'step-1',
 * //   commitMessage: 'Hachiko: add-jsdoc - step-1',
 * //   branchName: 'hachi/add-jsdoc/step-1'
 * // }
 * ```
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
  };

  // Remove undefined values
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

/**
 * Generates a standardized commit message for a migration step.
 *
 * @param planId - The unique identifier for the migration plan
 * @param stepId - The identifier for the specific step within the migration
 * @param chunk - Optional chunk identifier appended in parentheses
 * @returns A formatted commit message string
 * @example
 * ```typescript
 * generateCommitMessage('add-jsdoc', 'step-1');
 * // Returns: 'Hachiko: add-jsdoc - step-1'
 *
 * generateCommitMessage('add-jsdoc', 'step-1', 'chunk-a');
 * // Returns: 'Hachiko: add-jsdoc - step-1 (chunk-a)'
 * ```
 */
export function generateCommitMessage(planId: string, stepId: string, chunk?: string): string {
  const chunkSuffix = chunk ? ` (${chunk})` : "";
  return `Hachiko: ${planId} - ${stepId}${chunkSuffix}`;
}

/**
 * Generates a branch name for a migration step.
 *
 * @param planId - The unique identifier for the migration plan
 * @param stepId - The identifier for the specific step within the migration
 * @param chunk - Optional chunk identifier appended as an additional path segment
 * @returns A formatted branch name string
 * @example
 * ```typescript
 * generateBranchName('add-jsdoc', 'step-1');
 * // Returns: 'hachi/add-jsdoc/step-1'
 *
 * generateBranchName('add-jsdoc', 'step-1', 'chunk-a');
 * // Returns: 'hachi/add-jsdoc/step-1/chunk-a'
 * ```
 */
export function generateBranchName(planId: string, stepId: string, chunk?: string): string {
  const chunkSuffix = chunk ? `/${chunk}` : "";
  return `hachi/${planId}/${stepId}${chunkSuffix}`;
}
