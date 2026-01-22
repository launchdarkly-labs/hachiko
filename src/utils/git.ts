/**
 * Extracts all changed files from a list of commits by aggregating added, modified, and removed files.
 *
 * @param commits - Array of commit objects containing file change information
 * @returns Array of unique file paths that were changed across all commits
 * @example
 * ```typescript
 * const commits = [
 *   { added: ['new-file.ts'], modified: ['existing.ts'] },
 *   { removed: ['old-file.ts'] }
 * ];
 * const files = extractChangedFiles(commits);
 * // Returns: ['new-file.ts', 'existing.ts', 'old-file.ts']
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
 * Checks if a Git ref points to the default branch of a repository.
 *
 * @param ref - The Git ref to check, typically in the format "refs/heads/branch-name"
 * @param defaultBranch - The name of the default branch (e.g., "main" or "master")
 * @returns True if the ref points to the default branch, false otherwise
 * @example
 * ```typescript
 * isDefaultBranch('refs/heads/main', 'main'); // Returns: true
 * isDefaultBranch('refs/heads/feature-branch', 'main'); // Returns: false
 * ```
 */
export function isDefaultBranch(ref: string, defaultBranch: string): boolean {
  // GitHub refs come in the format "refs/heads/branch-name"
  const branchName = ref.replace("refs/heads/", "");
  return branchName === defaultBranch;
}

/**
 * Generates a standardized branch name for a Hachiko migration step.
 *
 * @param planId - The unique identifier for the migration plan
 * @param stepId - The identifier for the specific step within the migration
 * @param chunk - Optional chunk identifier for large migrations split into multiple parts
 * @returns A formatted branch name following the pattern "hachi/{planId}/{stepId}" or "hachi/{planId}/{stepId}/{chunk}"
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
 * Parses a Hachiko migration branch name to extract its component metadata.
 *
 * @param branchName - The branch name to parse, expected in format "hachi/{planId}/{stepId}" or "hachi/{planId}/{stepId}/{chunk}"
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
 * Checks if a branch name follows the Hachiko migration branch naming convention.
 *
 * @param branchName - The branch name to check
 * @returns True if the branch name starts with "hachi/", indicating it's a migration branch
 * @example
 * ```typescript
 * isMigrationBranch('hachi/add-jsdoc/step-1'); // Returns: true
 * isMigrationBranch('feature/my-feature'); // Returns: false
 * ```
 */
export function isMigrationBranch(branchName: string): boolean {
  return branchName.startsWith("hachi/");
}
