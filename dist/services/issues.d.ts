import type { HachikoConfig } from "../config/schema.js";
import type { ContextWithRepository } from "../types/context.js";
import type { Logger } from "../utils/logger.js";
import type { MigrationPlan } from "./plans.js";
/**
 * Create a Migration Issue for a new plan
 */
export declare function createMigrationIssue(
  context: ContextWithRepository,
  plan: MigrationPlan,
  config: HachikoConfig,
  logger: Logger
): Promise<void>;
/**
 * Create a Plan Review PR for a new plan
 */
export declare function createPlanReviewPR(
  context: ContextWithRepository,
  plan: MigrationPlan,
  config: HachikoConfig,
  logger: Logger
): Promise<void>;
//# sourceMappingURL=issues.d.ts.map
