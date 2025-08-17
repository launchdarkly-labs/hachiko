import type { Context } from "probot";
import type { HachikoConfig } from "../config/schema.js";
import type { Logger } from "../utils/logger.js";
import type { MigrationPlan } from "./plans.js";
/**
 * Create a Migration Issue for a new plan
 */
export declare function createMigrationIssue(context: Context, plan: MigrationPlan, config: HachikoConfig, logger: Logger): Promise<void>;
/**
 * Create a Plan Review PR for a new plan
 */
export declare function createPlanReviewPR(context: Context, plan: MigrationPlan, config: HachikoConfig, logger: Logger): Promise<void>;
//# sourceMappingURL=issues.d.ts.map