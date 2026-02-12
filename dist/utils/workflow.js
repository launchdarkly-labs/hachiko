/**
 * Checks if a GitHub Actions workflow run belongs to the Hachiko agent system.
 *
 * Identifies Hachiko workflows by checking whether the workflow name matches
 * the known Hachiko agent runner name or contains "hachiko" (case-insensitive).
 *
 * @param workflowRun - The workflow run object to inspect
 * @param workflowRun.name - The name of the workflow
 * @returns True if the workflow is a Hachiko agent workflow, false otherwise
 *
 * @example
 * ```typescript
 * isHachikoWorkflow({ name: 'Hachiko Agent Runner' }); // Returns: true
 * isHachikoWorkflow({ name: 'CI Build' }); // Returns: false
 * ```
 */
export function isHachikoWorkflow(workflowRun) {
    return (workflowRun.name === "Hachiko Agent Runner" ||
        workflowRun.name.includes("hachiko") ||
        workflowRun.name.includes("Hachiko"));
}
/**
 * Extracts migration metadata from a Hachiko workflow run event.
 *
 * Attempts to identify the plan ID, step ID, and optional chunk from the
 * workflow run using two strategies:
 * 1. Parses the head commit message for the Hachiko title format
 * 2. Falls back to parsing the branch name if the commit message doesn't match
 *
 * @param workflowRun - The workflow run event data
 * @param workflowRun.head_commit - Optional commit object with the commit message
 * @param workflowRun.head_branch - Optional branch name for fallback parsing
 * @returns An object with planId, stepId, and optional chunk, or null if metadata cannot be extracted
 *
 * @example
 * ```typescript
 * extractHachikoWorkflowData({
 *   head_commit: { message: 'Hachiko: add-jsdoc - step-1' },
 *   head_branch: 'hachi/add-jsdoc/step-1'
 * });
 * // Returns: { planId: 'add-jsdoc', stepId: 'step-1', chunk: undefined }
 * ```
 */
export function extractHachikoWorkflowData(workflowRun) {
    // Try to extract from commit message first
    if (workflowRun.head_commit?.message) {
        const match = workflowRun.head_commit.message.match(/Hachiko:\s*([^-]+)\s*-\s*([^(]+)(?:\s*\(([^)]+)\))?/);
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
 * Generates a workflow dispatch payload for triggering agent execution.
 *
 * Builds a structured payload containing all the information needed to
 * dispatch an AI agent for a migration step, including auto-generated
 * commit messages and branch names.
 *
 * @param planId - The unique identifier for the migration plan
 * @param stepId - The identifier for the specific step within the migration
 * @param chunk - Optional chunk identifier for large migrations split into parts
 * @param promptConfigRef - Optional reference to a specific prompt configuration version
 * @param additionalData - Optional extra key-value pairs to include in the payload
 * @returns A payload object with undefined values filtered out
 *
 * @example
 * ```typescript
 * const payload = generateAgentDispatchPayload('add-jsdoc', 'step-1');
 * // Returns: {
 * //   planId: 'add-jsdoc',
 * //   stepId: 'step-1',
 * //   commitMessage: 'Hachiko: add-jsdoc - step-1',
 * //   branchName: 'hachi/add-jsdoc/step-1'
 * // }
 * ```
 */
export function generateAgentDispatchPayload(planId, stepId, chunk, promptConfigRef, additionalData) {
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
 * Generates a standardized commit message for migration changes.
 *
 * Follows the format: `Hachiko: {planId} - {stepId}` with an optional
 * chunk suffix in parentheses.
 *
 * @param planId - The unique identifier for the migration plan
 * @param stepId - The identifier for the specific step
 * @param chunk - Optional chunk identifier appended in parentheses
 * @returns A formatted commit message string
 *
 * @example
 * ```typescript
 * generateCommitMessage('add-jsdoc', 'step-1');
 * // Returns: 'Hachiko: add-jsdoc - step-1'
 *
 * generateCommitMessage('add-jsdoc', 'step-1', 'chunk-a');
 * // Returns: 'Hachiko: add-jsdoc - step-1 (chunk-a)'
 * ```
 */
export function generateCommitMessage(planId, stepId, chunk) {
    const chunkSuffix = chunk ? ` (${chunk})` : "";
    return `Hachiko: ${planId} - ${stepId}${chunkSuffix}`;
}
/**
 * Generates a standardized branch name for a migration step.
 *
 * Follows the format: `hachi/{planId}/{stepId}` with an optional
 * chunk suffix.
 *
 * @param planId - The unique identifier for the migration plan
 * @param stepId - The identifier for the specific step
 * @param chunk - Optional chunk identifier appended as an additional path segment
 * @returns A formatted branch name string
 *
 * @example
 * ```typescript
 * generateBranchName('add-jsdoc', 'step-1');
 * // Returns: 'hachi/add-jsdoc/step-1'
 *
 * generateBranchName('add-jsdoc', 'step-1', 'chunk-a');
 * // Returns: 'hachi/add-jsdoc/step-1/chunk-a'
 * ```
 */
export function generateBranchName(planId, stepId, chunk) {
    const chunkSuffix = chunk ? `/${chunk}` : "";
    return `hachi/${planId}/${stepId}${chunkSuffix}`;
}
//# sourceMappingURL=workflow.js.map