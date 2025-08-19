import type { ContextWithRepository } from "../types/context.js";
/**
 * Migration state enumeration
 */
export declare const MigrationState: {
    readonly DRAFT: "draft";
    readonly PLAN_APPROVED: "plan-approved";
    readonly QUEUED: "queued";
    readonly RUNNING: "running";
    readonly AWAITING_REVIEW: "awaiting-review";
    readonly COMPLETED: "completed";
    readonly FAILED: "failed";
    readonly CANCELLED: "cancelled";
    readonly PAUSED: "paused";
};
export type MigrationStateType = (typeof MigrationState)[keyof typeof MigrationState];
/**
 * Step state enumeration
 */
export declare const StepState: {
    readonly PENDING: "pending";
    readonly RUNNING: "running";
    readonly COMPLETED: "completed";
    readonly FAILED: "failed";
    readonly SKIPPED: "skipped";
    readonly PAUSED: "paused";
};
export type StepStateType = (typeof StepState)[keyof typeof StepState];
/**
 * Migration progress data structure
 */
export interface MigrationProgress {
    planId: string;
    state: MigrationStateType;
    issueNumber: number;
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    skippedSteps: number;
    currentStep?: string | undefined;
    startedAt?: string;
    completedAt?: string;
    lastUpdatedAt: string;
    steps: Record<string, StepProgress>;
    metadata: {
        owner: string;
        repository: string;
        baseBranch: string;
        [key: string]: unknown;
    };
}
/**
 * Step progress data structure
 */
export interface StepProgress {
    stepId: string;
    state: StepStateType;
    startedAt?: string;
    completedAt?: string;
    pullRequest?: {
        number: number;
        url: string;
        merged: boolean;
    };
    workflowRun?: {
        id: number;
        url: string;
        conclusion: string;
    };
    agent?: string;
    error?: string;
    retryCount: number;
    chunks?: Record<string, ChunkProgress>;
}
/**
 * Chunk progress data structure
 */
export interface ChunkProgress {
    chunkId: string;
    state: StepStateType;
    startedAt?: string;
    completedAt?: string;
    pullRequest?: {
        number: number;
        url: string;
        merged: boolean;
    };
    files: string[];
    error?: string;
}
/**
 * State management service using GitHub Issues as the backend
 */
export declare class StateManager {
    private static instance;
    private constructor();
    static getInstance(): StateManager;
    /**
     * Create a new migration state
     */
    createMigrationState(context: ContextWithRepository, planId: string, issueNumber: number, totalSteps: number, stepIds: string[]): Promise<MigrationProgress>;
    /**
     * Load migration state from GitHub Issue
     */
    loadMigrationState(context: ContextWithRepository, planId: string): Promise<MigrationProgress | null>;
    /**
     * Update migration state
     */
    updateMigrationState(context: ContextWithRepository, planId: string, newState: MigrationStateType): Promise<MigrationProgress>;
    /**
     * Update step state
     */
    updateStepState(context: ContextWithRepository, planId: string, stepId: string, newState: StepStateType, metadata?: Partial<StepProgress>): Promise<MigrationProgress>;
    /**
     * Get migration state
     */
    getMigrationState(context: ContextWithRepository, planId: string): Promise<MigrationProgress | null>;
    /**
     * List all active migrations
     */
    listActiveMigrations(context: ContextWithRepository): Promise<MigrationProgress[]>;
    /**
     * Persist state to GitHub Issue
     */
    private persistState;
    /**
     * Parse state from issue body
     */
    private parseStateFromIssue;
    /**
     * Generate issue body with embedded state
     */
    private generateIssueBody;
    /**
     * Recalculate progress counters
     */
    private recalculateProgress;
}
/**
 * Factory function to get state manager instance
 */
export declare function createStateManager(): StateManager;
//# sourceMappingURL=state.d.ts.map