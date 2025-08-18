/**
 * Check if a workflow run is a Hachiko agent workflow
 */
export declare function isHachikoWorkflow(workflowRun: {
    name: string;
}): boolean;
/**
 * Extract Hachiko workflow data from workflow run event
 */
export declare function extractHachikoWorkflowData(workflowRun: {
    head_commit?: {
        message: string;
    };
    head_branch?: string;
}): {
    planId: string;
    stepId: string;
    chunk: string | undefined;
} | null;
/**
 * Generate workflow dispatch payload for agent execution
 */
export declare function generateAgentDispatchPayload(planId: string, stepId: string, chunk?: string, promptConfigRef?: string, additionalData?: Record<string, unknown>): Record<string, unknown>;
/**
 * Generate commit message for migration changes
 */
export declare function generateCommitMessage(planId: string, stepId: string, chunk?: string): string;
/**
 * Generate branch name for migration step
 */
export declare function generateBranchName(planId: string, stepId: string, chunk?: string): string;
//# sourceMappingURL=workflow.d.ts.map