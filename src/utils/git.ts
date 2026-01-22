/**
 * Extracts a deduplicated list of changed files from a list of commits
 *
 * Collects all files that were added, modified, or removed across the provided
 * commits and returns them as a unique set. This is useful for determining which
 * files need to be processed after a push event.
 *
 * @param commits - Array of commit objects containing file change information
 * @returns Array of unique file paths that were changed across all commits
 * @example
 * ```typescript
 * const commits = [
 *   { added: ['src/new.ts'], modified: ['src/existing.ts'] },
 *   { removed: ['src/old.ts'], modified: ['src/existing.ts'] }
 * ];
 * const files = extractChangedFiles(commits);
 * // Returns: ['src/new.ts', 'src/existing.ts', 'src/old.ts']
 * ```
 */
export function extractChangedFiles(
  commits: Array<{ added?: string[]; modified?: string[]; removed?: string[] }>
): string[] {
  const changedFiles = new Set<string>();

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
 * Checks if a Git ref points to the repository's default branch
 *
 * Handles GitHub's ref format (refs/heads/branch-name) by stripping the prefix
 * before comparing against the default branch name.
 *
 * @param ref - The Git ref to check (e.g., "refs/heads/main" or "main")
 * @param defaultBranch - The name of the default branch (e.g., "main" or "master")
 * @returns True if the ref points to the default branch, false otherwise
 * @example
 * ```typescript
 * isDefaultBranch('refs/heads/main', 'main'); // Returns: true
 * isDefaultBranch('refs/heads/feature', 'main'); // Returns: false
 * isDefaultBranch('main', 'main'); // Returns: true
 * ```
 */
export function isDefaultBranch(ref: string, defaultBranch: string): boolean {
  // GitHub refs come in the format "refs/heads/branch-name"
  const branchName = ref.replace("refs/heads/", "");
  return branchName === defaultBranch;
}

/**
 * Generates a standardized branch name for a Hachiko migration step
 *
 * Creates branch names following the pattern: hachi/{planId}/{stepId}[/{chunk}]
 * This naming convention enables automatic detection and tracking of migration PRs.
 *
 * @param planId - The unique identifier for the migration plan
 * @param stepId - The identifier for the specific step within the migration
 * @param chunk - Optional chunk identifier for large migrations split into parts
 * @returns The formatted branch name string
 * @example
 * ```typescript
 * generateMigrationBranchName('add-jsdoc', 'step-1');
 * // Returns: 'hachi/add-jsdoc/step-1'
 *
 * generateMigrationBranchName('add-jsdoc', 'step-1', 'chunk-a');
 * // Returns: 'hachi/add-jsdoc/step-1/chunk-a'
 * ```
 */
export function generateMigrationBranchName(
  planId: string,
  stepId: string,
  chunk?: string
): string {
  const chunkSuffix = chunk ? `/${chunk}` : "";
  return `hachi/${planId}/${stepId}${chunkSuffix}`;
}

/**
 * Parses a Hachiko migration branch name to extract its metadata components
 *
 * Extracts the plan ID, step ID, and optional chunk identifier from branch names
 * that follow the hachi/{planId}/{stepId}[/{chunk}] pattern. This is the inverse
 * operation of generateMigrationBranchName.
 *
 * @param branchName - The branch name to parse
 * @returns An object containing planId, stepId, and optional chunk, or null if the branch name doesn't match the expected pattern
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
export function parseMigrationBranchName(branchName: string): {
  planId: string;
  stepId: string;
  chunk: string | undefined;
} | null {
  const match = branchName.match(/^hachi\/([^/]+)\/([^/]+)(?:\/(.+))?$/);

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
 * Checks if a branch name follows the Hachiko migration branch naming convention
 *
 * Determines whether a branch is a Hachiko migration branch by checking if it
 * starts with the "hachi/" prefix. This is a quick check used for filtering
 * branches before more detailed parsing with parseMigrationBranchName.
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
export function isMigrationBranch(branchName: string): boolean {
  return branchName.startsWith("hachi/");
}
