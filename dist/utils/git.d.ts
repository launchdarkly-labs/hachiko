/**
 * Extract changed files from a list of commits
 */
export declare function extractChangedFiles(
  commits: Array<{
    added?: string[];
    modified?: string[];
    removed?: string[];
  }>
): string[];
/**
 * Check if a ref is the default branch
 */
export declare function isDefaultBranch(ref: string, defaultBranch: string): boolean;
/**
 * Generate a branch name for a migration step
 */
export declare function generateMigrationBranchName(
  planId: string,
  stepId: string,
  chunk?: string
): string;
/**
 * Parse a migration branch name to extract metadata
 */
export declare function parseMigrationBranchName(branchName: string): {
  planId: string;
  stepId: string;
  chunk: string | undefined;
} | null;
/**
 * Check if a branch name is a Hachiko migration branch
 */
export declare function isMigrationBranch(branchName: string): boolean;
//# sourceMappingURL=git.d.ts.map
