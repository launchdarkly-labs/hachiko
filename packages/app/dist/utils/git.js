"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractChangedFiles = extractChangedFiles;
exports.isDefaultBranch = isDefaultBranch;
exports.generateMigrationBranchName = generateMigrationBranchName;
exports.parseMigrationBranchName = parseMigrationBranchName;
exports.isMigrationBranch = isMigrationBranch;
/**
 * Extract changed files from a list of commits
 */
function extractChangedFiles(commits) {
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
function isDefaultBranch(ref, defaultBranch) {
    // GitHub refs come in the format "refs/heads/branch-name"
    const branchName = ref.replace("refs/heads/", "");
    return branchName === defaultBranch;
}
/**
 * Generate a branch name for a migration step
 */
function generateMigrationBranchName(planId, stepId, chunk) {
    const chunkSuffix = chunk ? `/${chunk}` : "";
    return `hachi/${planId}/${stepId}${chunkSuffix}`;
}
/**
 * Parse a migration branch name to extract metadata
 */
function parseMigrationBranchName(branchName) {
    const match = branchName.match(/^hachi\/([^/]+)\/([^/]+)(?:\/(.+))?$/);
    if (!match) {
        return null;
    }
    return {
        planId: match[1],
        stepId: match[2],
        chunk: match[3],
    };
}
/**
 * Check if a branch name is a Hachiko migration branch
 */
function isMigrationBranch(branchName) {
    return branchName.startsWith("hachi/");
}
//# sourceMappingURL=git.js.map