/**
 * Extracts a deduplicated list of changed files from a list of commits.
 *
 * This function aggregates all files that were added, modified, or removed
 * across multiple commits and returns them as a unique set of file paths.
 *
 * @param commits - Array of commit objects containing file change information
 * @param commits[].added - Optional array of file paths that were added in the commit
 * @param commits[].modified - Optional array of file paths that were modified in the commit
 * @param commits[].removed - Optional array of file paths that were removed in the commit
 * @returns Array of unique file paths that were changed across all commits
 * @example
 * ```typescript
 * const commits = [
 *   { added: ['src/new.ts'], modified: ['src/existing.ts'] },
 *   { modified: ['src/existing.ts'], removed: ['src/old.ts'] }
 * ];
 * const changedFiles = extractChangedFiles(commits);
 * // Returns: ['src/new.ts', 'src/existing.ts', 'src/old.ts']
 * ```
 */
export declare function extractChangedFiles(commits: Array<{
    added?: string[];
    modified?: string[];
    removed?: string[];
}>): string[];
/**
 * Checks if a Git reference points to the default branch.
 *
 * This function handles GitHub's ref format (refs/heads/branch-name) by
 * stripping the prefix before comparing against the default branch name.
 *
 * @param ref - The Git reference to check (e.g., "refs/heads/main" or "main")
 * @param defaultBranch - The name of the default branch (e.g., "main" or "master")
 * @returns True if the ref points to the default branch, false otherwise
 * @example
 * ```typescript
 * isDefaultBranch('refs/heads/main', 'main'); // Returns: true
 * isDefaultBranch('refs/heads/feature-branch', 'main'); // Returns: false
 * isDefaultBranch('main', 'main'); // Returns: true
 * ```
 */
export declare function isDefaultBranch(ref: string, defaultBranch: string): boolean;
/**
 * Generates a standardized branch name for a Hachiko migration step.
 *
 * Branch names follow the pattern: hachi/{planId}/{stepId}[/{chunk}]
 * This naming convention enables automatic detection and tracking of
 * migration-related branches by the Hachiko system.
 *
 * @param planId - The unique identifier for the migration plan
 * @param stepId - The identifier for the specific step within the migration
 * @param chunk - Optional chunk identifier for large migrations split into parts
 * @returns The formatted branch name string
 * @example
 * ```typescript
 * generateMigrationBranchName('add-jsdoc', '1');
 * // Returns: 'hachi/add-jsdoc/1'
 *
 * generateMigrationBranchName('add-jsdoc', '2', 'chunk-a');
 * // Returns: 'hachi/add-jsdoc/2/chunk-a'
 * ```
 */
export declare function generateMigrationBranchName(planId: string, stepId: string, chunk?: string): string;
/**
 * Parses a Hachiko migration branch name to extract its metadata components.
 *
 * This function uses regex matching to extract the plan ID, step ID, and
 * optional chunk identifier from branch names following the Hachiko naming
 * convention (hachi/{planId}/{stepId}[/{chunk}]).
 *
 * @param branchName - The branch name to parse
 * @returns An object containing planId, stepId, and optional chunk, or null if the branch name doesn't match the expected pattern
 * @example
 * ```typescript
 * parseMigrationBranchName('hachi/add-jsdoc/1');
 * // Returns: { planId: 'add-jsdoc', stepId: '1', chunk: undefined }
 *
 * parseMigrationBranchName('hachi/add-jsdoc/2/chunk-a');
 * // Returns: { planId: 'add-jsdoc', stepId: '2', chunk: 'chunk-a' }
 *
 * parseMigrationBranchName('feature/my-branch');
 * // Returns: null
 * ```
 */
export declare function parseMigrationBranchName(branchName: string): {
    planId: string;
    stepId: string;
    chunk: string | undefined;
} | null;
/**
 * Checks if a branch name follows the Hachiko migration branch naming convention.
 *
 * Hachiko migration branches are identified by the "hachi/" prefix. This is a
 * quick check used to filter branches before more detailed parsing.
 *
 * @param branchName - The branch name to check
 * @returns True if the branch name starts with "hachi/", false otherwise
 * @example
 * ```typescript
 * isMigrationBranch('hachi/add-jsdoc/1'); // Returns: true
 * isMigrationBranch('feature/my-feature'); // Returns: false
 * isMigrationBranch('main'); // Returns: false
 * ```
 */
export declare function isMigrationBranch(branchName: string): boolean;
//# sourceMappingURL=git.d.ts.map