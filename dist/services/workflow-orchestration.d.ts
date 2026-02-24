/**
 * Workflow orchestration logic extracted from bash/YAML into testable TypeScript.
 *
 * Previously lived in:
 *   - migration-dashboard.yml (checkbox parsing, step calculation, dispatch triggering)
 *   - advance-migration.sh (frontmatter mutation, next-step triggering)
 *   - pause-migration.sh (frontmatter mutation)
 */
import type { ContextWithRepository } from "../types/context.js";
import type { MigrationStateInfo } from "./state-inference.js";
export interface DashboardCheckboxState {
    /** Migration IDs checked in the Pending section */
    pending: string[];
    /** Migration IDs checked in the Paused section */
    paused: string[];
    /** Migration IDs checked in the In-Progress section */
    inProgress: string[];
    /** Nested "Start step N" checkboxes in the In-Progress section */
    restartRequests: Array<{
        migrationId: string;
        step: number;
    }>;
    /** Whether the "Force dashboard regeneration" checkbox is checked */
    forceRegeneration: boolean;
}
export interface MigrationAction {
    action: "start" | "resume" | "force-retry" | "skip" | "cleanup";
    stepId: string | number;
}
export interface PRClosureResult {
    nextAction: "advance" | "pause" | "cleanup";
    nextStep?: number;
}
/**
 * Parse the migration dashboard issue body to extract checked checkboxes
 * from each section.
 *
 * Dashboard structure:
 *   ## 🟡 Pending Migrations
 *   - [x] `migration-id` - Title          ← checked = start
 *   ## 🔄 In-Progress Migrations
 *   - [ ] `migration-id` - Title (Step 2/3)
 *       - [x] Start step 2                ← nested restart request
 *   ## ⏸️ Paused Migrations
 *   - [x] `migration-id` - Title          ← checked = resume
 *   ---
 *   - [x] **Force dashboard regeneration**
 */
export declare function parseDashboardCheckboxes(issueBody: string): DashboardCheckboxState;
/**
 * Given a migration ID and its context, determine what action to take.
 *
 * - pending section checkbox checked → start from step 1
 * - paused section checkbox checked → resume from currentStep (the step that needs to run)
 * - in-progress section checkbox checked → force-retry the currentStep
 * - restart request → start at the specified step
 * - cleanup detection → return cleanup action
 */
export declare function determineMigrationAction(params: {
    migrationId: string;
    section: "pending" | "paused" | "in-progress";
    stateInfo: MigrationStateInfo;
    totalSteps: number;
    prBranch?: string;
}): MigrationAction;
/**
 * Determine what should happen when a Hachiko PR is closed.
 *
 * - Merged + step < totalSteps → advance (next step = currentStep from state inference)
 * - Merged + step >= totalSteps → cleanup (migration complete)
 * - Merged + branch contains "cleanup"/"final" → cleanup
 * - Not merged → pause
 */
export declare function handlePRClosure(params: {
    migrationId: string;
    wasMerged: boolean;
    prBranch: string;
    stateInfo: MigrationStateInfo;
    totalSteps: number;
}): PRClosureResult;
/**
 * Normalize a PR that was detected as a Hachiko migration PR but doesn't use
 * the hachiko/* branch naming convention (e.g. cursor/*, devin/* branches).
 *
 * Adds the hachiko:migration label and a tracking comment if not already present.
 */
export declare function normalizePR(params: {
    prNumber: number;
    migrationId: string;
    existingLabels: string[];
    existingComments: string[];
    context: ContextWithRepository;
}): Promise<{
    labelAdded: boolean;
    commentAdded: boolean;
}>;
/**
 * Pure function: update migration frontmatter content string.
 * Returns new file content with updated fields.
 */
export declare function updateMigrationFrontmatter(fileContent: string, action: "advance" | "pause" | "complete"): string;
/**
 * I/O function: read the migration file, apply an update, and write it back.
 */
export declare function applyFrontmatterUpdate(migrationId: string, action: "advance" | "pause" | "complete", context: ContextWithRepository): Promise<void>;
/**
 * Check if there are in-progress workflow runs for execute-migration.
 * Returns true if a run is in progress (should skip triggering).
 */
export declare function isMigrationRunning(context: ContextWithRepository): Promise<boolean>;
/**
 * Check if there are open Hachiko PRs for a migration.
 * Used as a guard before triggering the next step to avoid duplicates.
 */
export declare function hasOpenPRsForMigration(migrationId: string, context: ContextWithRepository): Promise<boolean>;
/**
 * Read total_steps from the migration document frontmatter.
 * Returns 0 if the document doesn't exist or isn't schema v1.
 */
export declare function getTotalSteps(migrationId: string, context: ContextWithRepository): Promise<number>;
/**
 * Detect migration ID from a closed PR.
 *
 * Tries multiple paths:
 * 1. detectHachikoPR (branch name, body tracking token, title)
 * 2. Commit tracking tokens (for Devin-style agents)
 *
 * Returns { migrationId, stepNumber? } or null if not a hachiko PR.
 */
export declare function detectMigrationFromClosedPR(prNumber: number, prBranch: string, context: ContextWithRepository): Promise<{
    migrationId: string;
    stepNumber?: number;
} | null>;
//# sourceMappingURL=workflow-orchestration.d.ts.map