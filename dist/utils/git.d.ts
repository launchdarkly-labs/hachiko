/**
 * Extracts a deduplicated list of changed files from a list of commits.
 * Collects all files that were added, modified, or removed across all commits
 * and returns them as a unique set.
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
 * const files = extractChangedFiles(commits);
 * console.log(files); // ['src/new.ts', 'src/existing.ts', 'src/old.ts']
 * ```
 */
export declare function extractChangedFiles(commits: Array<{
    added?: string[];
    modified?: string[];
    removed?: string[];
}>): string[];
/**
 * Checks if a Git reference points to the default branch.
 * Handles GitHub-style refs that include the "refs/heads/" prefix.
 *
 * @param ref - The Git reference to check (e.g., "refs/heads/main" or "main")
 * @param defaultBranch - The name of the default branch (e.g., "main" or "master")
 * @returns True if the ref points to the default branch, false otherwise
 * @example
 * ```typescript
 * isDefaultBranch('refs/heads/main', 'main'); // true
 * isDefaultBranch('refs/heads/feature-branch', 'main'); // false
 * isDefaultBranch('main', 'main'); // true
 * ```
 */
export declare function isDefaultBranch(ref: string, defaultBranch: string): boolean;
/**
 * Generates a standardized branch name for a Hachiko migration step.
 * Branch names follow the pattern: hachi/{planId}/{stepId}[/{chunk}]
 *
 * @param planId - The unique identifier for the migration plan
 * @param stepId - The identifier for the specific step within the migration
 * @param chunk - Optional chunk identifier for splitting large migrations into smaller parts
 * @returns The formatted branch name string
 * @example
 * ```typescript
 * generateMigrationBranchName('add-jsdoc', 'step-1'); // 'hachi/add-jsdoc/step-1'
 * generateMigrationBranchName('refactor', 'step-2', 'part-a'); // 'hachi/refactor/step-2/part-a'
 * ```
 */
export declare function generateMigrationBranchName(planId: string, stepId: string, chunk?: string): string;
/**
 * Parses a Hachiko migration branch name to extract its metadata components.
 * Expects branch names in the format: hachi/{planId}/{stepId}[/{chunk}]
 *
 * @param branchName - The branch name to parse
 * @returns An object containing planId, stepId, and optional chunk, or null if the branch name doesn't match the expected format
 * @example
 * ```typescript
 * parseMigrationBranchName('hachi/add-jsdoc/step-1');
 * // { planId: 'add-jsdoc', stepId: 'step-1', chunk: undefined }
 *
 * parseMigrationBranchName('hachi/refactor/step-2/part-a');
 * // { planId: 'refactor', stepId: 'step-2', chunk: 'part-a' }
 *
 * parseMigrationBranchName('feature/my-branch');
 * // null (not a migration branch)
 * ```
 */
export declare function parseMigrationBranchName(branchName: string): {
    planId: string;
    stepId: string;
    chunk: string | undefined;
} | null;
/**
 * Checks if a branch name follows the Hachiko migration branch naming convention.
 * Migration branches are identified by the "hachi/" prefix.
 *
 * @param branchName - The branch name to check
 * @returns True if the branch name starts with "hachi/", false otherwise
 * @example
 * ```typescript
 * isMigrationBranch('hachi/add-jsdoc/step-1'); // true
 * isMigrationBranch('feature/my-feature'); // false
 * isMigrationBranch('main'); // false
 * ```
 */
export declare function isMigrationBranch(branchName: string): boolean;
//# sourceMappingURL=git.d.ts.map