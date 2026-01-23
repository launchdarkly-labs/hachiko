/**
 * Extracts a deduplicated list of changed files from a list of commits.
 *
 * This function aggregates all files that were added, modified, or removed
 * across multiple commits and returns them as a unique set. This is useful
 * for determining which files were affected by a series of commits.
 *
 * @param commits - An array of commit objects containing file change information
 * @param commits[].added - Files that were added in the commit
 * @param commits[].modified - Files that were modified in the commit
 * @param commits[].removed - Files that were removed in the commit
 * @returns An array of unique file paths that were changed across all commits
 * @example
 * ```typescript
 * const commits = [
 *   { added: ['src/new.ts'], modified: ['src/existing.ts'] },
 *   { modified: ['src/existing.ts'], removed: ['src/old.ts'] }
 * ];
 * const files = extractChangedFiles(commits);
 * // Returns: ['src/new.ts', 'src/existing.ts', 'src/old.ts']
 * ```
 */
export function extractChangedFiles(commits) {
    const changedFiles = new Set();
    for (const commit of commits) {
        // Add files that were added, modified, or removed
        const allFiles = [
            ...(commit.added || []),
            ...(commit.modified || []),
            ...(commit.removed || []),
        ];
        for (const file of allFiles) {
            changedFiles.add(file);
        }
    }
    return Array.from(changedFiles);
}
/**
 * Checks if a Git reference points to the default branch.
 *
 * This function handles GitHub's ref format (refs/heads/branch-name) and
 * compares the extracted branch name against the provided default branch.
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
export function isDefaultBranch(ref, defaultBranch) {
    // GitHub refs come in the format "refs/heads/branch-name"
    const branchName = ref.replace("refs/heads/", "");
    return branchName === defaultBranch;
}
/**
 * Generates a standardized branch name for a Hachiko migration step.
 *
 * Branch names follow the format: `hachi/{planId}/{stepId}` with an optional
 * chunk suffix for migrations that are split into multiple chunks.
 *
 * @param planId - The unique identifier for the migration plan
 * @param stepId - The identifier for the specific step within the migration
 * @param chunk - Optional chunk identifier for large migrations split into parts
 * @returns A formatted branch name string
 * @example
 * ```typescript
 * generateMigrationBranchName('add-jsdoc', 'step-1');
 * // Returns: 'hachi/add-jsdoc/step-1'
 *
 * generateMigrationBranchName('add-jsdoc', 'step-1', 'chunk-a');
 * // Returns: 'hachi/add-jsdoc/step-1/chunk-a'
 * ```
 */
export function generateMigrationBranchName(planId, stepId, chunk) {
    const chunkSuffix = chunk ? `/${chunk}` : "";
    return `hachi/${planId}/${stepId}${chunkSuffix}`;
}
/**
 * Parses a Hachiko migration branch name to extract its metadata components.
 *
 * This function extracts the plan ID, step ID, and optional chunk identifier
 * from a branch name that follows the Hachiko naming convention.
 *
 * @param branchName - The branch name to parse (e.g., "hachi/add-jsdoc/step-1")
 * @returns An object containing planId, stepId, and optional chunk, or null if the branch name doesn't match the expected format
 * @example
 * ```typescript
 * parseMigrationBranchName('hachi/add-jsdoc/step-1');
 * // Returns: { planId: 'add-jsdoc', stepId: 'step-1', chunk: undefined }
 *
 * parseMigrationBranchName('hachi/add-jsdoc/step-1/chunk-a');
 * // Returns: { planId: 'add-jsdoc', stepId: 'step-1', chunk: 'chunk-a' }
 *
 * parseMigrationBranchName('feature/my-branch');
 * // Returns: null
 * ```
 */
export function parseMigrationBranchName(branchName) {
    const match = branchName.match(/^(?:hachi|hachiko)\/([^/]+)\/([^/]+)(?:\/(.+))?$/);
    if (!match || !match[1] || !match[2]) {
        return null;
    }
    return {
        planId: match[1],
        stepId: match[2],
        chunk: match[3] || undefined,
    };
}
/**
 * Checks if a branch name follows the Hachiko migration branch naming convention.
 *
 * Hachiko migration branches are identified by the "hachi/" prefix, which
 * distinguishes them from regular feature or development branches.
 *
 * @param branchName - The branch name to check
 * @returns True if the branch name starts with "hachi/", false otherwise
 * @example
 * ```typescript
 * isMigrationBranch('hachi/add-jsdoc/step-1'); // Returns: true
 * isMigrationBranch('feature/my-feature'); // Returns: false
 * isMigrationBranch('main'); // Returns: false
 * ```
 */
export function isMigrationBranch(branchName) {
    return branchName.startsWith("hachi/");
}
//# sourceMappingURL=git.js.map