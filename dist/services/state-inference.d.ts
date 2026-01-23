/**
 * Service for inferring migration state from PR activity and task completion
 * Implements the state inference model from the migration plan
 */
import type { ContextWithRepository } from "../types/context.js";
import type { Logger } from "../utils/logger.js";
import { type HachikoPR } from "./pr-detection.js";
import type { MigrationState } from "../config/migration-schema.js";
export interface MigrationStateInfo {
    state: MigrationState;
    openPRs: HachikoPR[];
    closedPRs: HachikoPR[];
    allTasksComplete: boolean;
    totalTasks: number;
    completedTasks: number;
    currentStep: number;
    lastUpdated: string;
}
/**
 * Get the inferred state of a migration based on PR activity and task completion
 *
 * State inference rules:
 * - "pending": No hachiko PRs have ever been created (not started)
 * - "active": Has open PRs OR has merged PRs (migration in progress)
 * - "paused": No open PRs, but has closed PRs that were NOT merged (agent gave up)
 * - "completed": All tasks checked off in main branch migration doc
 */
export declare function getMigrationState(context: ContextWithRepository, migrationId: string, migrationDocContent?: string, logger?: Logger): Promise<MigrationStateInfo>;
/**
 * Get task completion information from migration document content
 * Analyzes markdown checkboxes to determine completion status
 */
export declare function getTaskCompletionInfo(migrationDocContent: string): {
    allTasksComplete: boolean;
    totalTasks: number;
    completedTasks: number;
    tasks: Array<{
        completed: boolean;
        text: string;
    }>;
};
/**
 * Get migration document content from GitHub API
 */
export declare function getMigrationDocumentContent(context: ContextWithRepository, migrationId: string, ref?: string, logger?: Logger): Promise<string | null>;
/**
 * Get complete migration state with document content fetched from GitHub
 */
export declare function getMigrationStateWithDocument(context: ContextWithRepository, migrationId: string, ref?: string, logger?: Logger): Promise<MigrationStateInfo>;
/**
 * Get states for multiple migrations in parallel
 */
export declare function getMultipleMigrationStates(context: ContextWithRepository, migrationIds: string[], ref?: string, logger?: Logger): Promise<Map<string, MigrationStateInfo>>;
/**
 * Check if a migration document has been updated recently
 * This can be used to detect when agents have made progress
 */
export declare function getMigrationDocumentLastUpdated(context: ContextWithRepository, migrationId: string, ref?: string, logger?: Logger): Promise<Date | null>;
/**
 * Generate a human-readable summary of migration state
 */
export declare function getMigrationStateSummary(stateInfo: MigrationStateInfo): string;
//# sourceMappingURL=state-inference.d.ts.map