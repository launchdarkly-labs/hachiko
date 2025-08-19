/**
 * Extract changed files from a list of commits
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
 * Check if a ref is the default branch
 */
export function isDefaultBranch(ref, defaultBranch) {
    // GitHub refs come in the format "refs/heads/branch-name"
    const branchName = ref.replace("refs/heads/", "");
    return branchName === defaultBranch;
}
/**
 * Generate a branch name for a migration step
 */
export function generateMigrationBranchName(planId, stepId, chunk) {
    const chunkSuffix = chunk ? `/${chunk}` : "";
    return `hachi/${planId}/${stepId}${chunkSuffix}`;
}
/**
 * Parse a migration branch name to extract metadata
 */
export function parseMigrationBranchName(branchName) {
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
export function isMigrationBranch(branchName) {
    return branchName.startsWith("hachi/");
}
//# sourceMappingURL=git.js.map