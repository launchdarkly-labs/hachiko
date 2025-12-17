/**
 * Extract changed files from a list of commits
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
 * Check if a ref is the default branch
 */
export function isDefaultBranch(ref: string, defaultBranch: string): boolean {
  // GitHub refs come in the format "refs/heads/branch-name"
  const branchName = ref.replace("refs/heads/", "");
  return branchName === defaultBranch;
}

/**
 * Generate a branch name for a migration step
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
 * Parse a migration branch name to extract metadata
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
 * Check if a branch name is a Hachiko migration branch
 */
export function isMigrationBranch(branchName: string): boolean {
  return branchName.startsWith("hachi/");
}
