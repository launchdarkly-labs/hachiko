"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isHachikoWorkflow = isHachikoWorkflow;
exports.extractHachikoWorkflowData = extractHachikoWorkflowData;
exports.generateAgentDispatchPayload = generateAgentDispatchPayload;
exports.generateCommitMessage = generateCommitMessage;
exports.generateBranchName = generateBranchName;
/**
 * Check if a workflow run is a Hachiko agent workflow
 */
function isHachikoWorkflow(workflowRun) {
    return (workflowRun.name === "Hachiko Agent Runner" ||
        workflowRun.name.includes("hachiko") ||
        workflowRun.name.includes("Hachiko"));
}
/**
 * Extract Hachiko workflow data from workflow run event
 */
function extractHachikoWorkflowData(workflowRun) {
    // Try to extract from commit message first
    if (workflowRun.head_commit?.message) {
        const match = workflowRun.head_commit.message.match(/Hachiko:\s*([^-]+)\s*-\s*([^(]+)(?:\s*\(([^)]+)\))?/);
        if (match) {
            return {
                planId: match[1].trim(),
                stepId: match[2].trim(),
                chunk: match[3]?.trim(),
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
 * Generate workflow dispatch payload for agent execution
 */
function generateAgentDispatchPayload(planId, stepId, chunk, promptConfigRef, additionalData) {
    const payload = {
        planId,
        stepId,
        chunk,
        promptConfigRef,
        commitMessage: generateCommitMessage(planId, stepId, chunk),
        branchName: generateBranchName(planId, stepId, chunk),
        ...additionalData,
    };
    // Remove undefined values
    return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}
/**
 * Generate commit message for migration changes
 */
function generateCommitMessage(planId, stepId, chunk) {
    const chunkSuffix = chunk ? ` (${chunk})` : "";
    return `Hachiko: ${planId} - ${stepId}${chunkSuffix}`;
}
/**
 * Generate branch name for migration step
 */
function generateBranchName(planId, stepId, chunk) {
    const chunkSuffix = chunk ? `/${chunk}` : "";
    return `hachi/${planId}/${stepId}${chunkSuffix}`;
}
//# sourceMappingURL=workflow.js.map