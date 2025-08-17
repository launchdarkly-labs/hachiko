import type { Context } from "probot";
import type { Logger } from "../utils/logger.js";
/**
 * Update GitHub Checks API with agent workflow results
 */
export declare function updateChecksStatus(context: Context<"workflow_run.completed">, workflowRun: any, // TODO: Type this properly
workflowData: {
    planId: string;
    stepId: string;
    chunk?: string;
}, logger: Logger): Promise<void>;
//# sourceMappingURL=checks.d.ts.map