/**
 * Check if a PR is managed by Hachiko
 */
export declare function isMigrationPR(pr: {
    labels?: Array<{
        name: string;
    }>;
}): boolean;
/**
 * Extract Hachiko-specific labels from a PR
 */
export declare function extractHachikoLabels(pr: {
    labels?: Array<{
        name: string;
    }>;
}): string[];
/**
 * Extract migration metadata from PR labels and branch name
 */
export declare function extractMigrationMetadata(pr: {
    labels?: Array<{
        name: string;
    }>;
    head?: {
        ref: string;
    };
}): {
    planId: string;
    stepId: string;
    chunk?: string;
} | null;
/**
 * Generate labels for a migration PR
 */
export declare function generateMigrationPRLabels(planId: string, stepId: string, chunk?: string, additionalLabels?: string[]): string[];
/**
 * Generate a PR title for a migration step
 */
export declare function generateMigrationPRTitle(planTitle: string, stepDescription: string, chunk?: string): string;
/**
 * Generate a PR body for a migration step
 */
export declare function generateMigrationPRBody(planId: string, stepId: string, stepDescription: string, planUrl?: string, chunk?: string, promptVersion?: string): string;
//# sourceMappingURL=pr.d.ts.map