import type { Context } from "probot";
import type { Logger } from "../utils/logger.js";
/**
 * Update migration progress in the Migration Issue
 */
export declare function updateMigrationProgress(context: Context, planId: string, stepId: string, status: string, metadata?: Record<string, unknown>, logger?: Logger): Promise<void>;
/**
 * Emit repository dispatch event for next migration step
 */
export declare function emitNextStep(context: Context, planId: string, completedStepId: string, chunk?: string, logger?: Logger): Promise<void>;
//# sourceMappingURL=migrations.d.ts.map