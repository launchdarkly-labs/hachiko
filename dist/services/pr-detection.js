/**
 * Service for detecting and identifying Hachiko PRs using multiple identification methods
 * Based on the state inference plan: branch naming, labels, and title patterns
 */
import { createLogger } from "../utils/logger.js";
/**
 * Detect if a PR is a Hachiko migration PR and extract migration ID
 * Uses triple identification: branch name, labels, and title
 */
export function detectHachikoPR(pr) {
    const migrationId = extractMigrationId(pr);
    if (!migrationId) {
        return null;
    }
    return {
        number: pr.number,
        title: pr.title,
        state: pr.state,
        migrationId,
        branch: pr.head.ref,
        labels: pr.labels.map((l) => l.name),
        url: pr.html_url,
        merged: pr.merged_at !== null,
    };
}
/**
 * Extract migration ID from branch name only
 */
function extractMigrationIdFromBranch(branchRef) {
    // Pattern: hachiko/{migration-id} or hachiko/{migration-id}-description
    const branchMatch = branchRef.match(/^hachiko\/(.+)$/);
    if (branchMatch && branchMatch[1]) {
        const fullId = branchMatch[1];
        // For branches like "hachiko/add-jsdoc-comments-utility-functions"
        // we want to extract "add-jsdoc-comments"
        // But for "hachiko/react-v16-to-v18-hooks-migration" we want the full thing
        // Strategy: check if parts at the end look like description words
        const parts = fullId.split("-");
        if (parts.length > 1) {
            const descriptionWords = [
                "impl",
                "implementation",
                "fix",
                "update",
                "refactor",
                "feature",
                "utility",
                "functions",
                "components",
                "hooks",
                "tests",
                "simple",
                "complex",
                "basic",
                "advanced",
                "step",
                "cleanup",
                "final",
                "devin",
                "cursor",
                "v2",
                "v3",
                "1",
                "2",
                "3",
                "4",
                "5",
                "6",
                "7",
                "8",
                "9",
            ];
            // Find how many parts at the end are description words
            let descriptivePartsCount = 0;
            for (let i = parts.length - 1; i >= 0; i--) {
                if (descriptionWords.includes(parts[i].toLowerCase())) {
                    descriptivePartsCount++;
                }
                else {
                    break; // Stop at first non-descriptive word
                }
            }
            if (descriptivePartsCount > 0) {
                return parts.slice(0, -descriptivePartsCount).join("-");
            }
        }
        return fullId;
    }
    return null;
}
/**
 * Extract migration ID from PR using multiple identification methods
 * Method 1: Branch naming - hachiko/{migration-id} or hachiko/{migration-id}-*
 * Method 2: Tracking token in PR body or title - hachiko-track:{migration-id}:{step-id}
 * Method 3: PR title - contains [{migration-id}] somewhere
 */
export function extractMigrationId(pr) {
    // Method 1: Check branch name
    const branchId = extractMigrationIdFromBranch(pr.head.ref);
    if (branchId) {
        return branchId;
    }
    // Method 2: Check for tracking token in PR body (must be in HTML comment to avoid false positives)
    if (pr.body) {
        const bodyTrackingMatch = pr.body.match(/<!--\s*hachiko-track:([^:\s]+)/);
        if (bodyTrackingMatch && bodyTrackingMatch[1]) {
            return bodyTrackingMatch[1];
        }
    }
    // Method 3: Check for tracking token in title (fallback)
    const titleTrackingMatch = pr.title.match(/hachiko-track:([^:\s]+)/);
    if (titleTrackingMatch && titleTrackingMatch[1]) {
        return titleTrackingMatch[1];
    }
    // Method 4: Check title for migration ID patterns
    // Pattern 1: [migration-id] in brackets
    const bracketMatch = pr.title.match(/\[([^\]]+)\]/);
    if (bracketMatch && bracketMatch[1]) {
        return bracketMatch[1];
    }
    // Pattern 2: "Migration: Title (Step X/Y)" - extract from content
    // This requires mapping back to migration ID from title, which is fragile
    // For now, rely on branch name detection for agent PRs
    return null;
}
/**
 * Get all open Hachiko PRs for a specific migration
 */
export async function getOpenHachikoPRs(context, migrationId, logger) {
    return await getHachikoPRs(context, migrationId, "open", logger);
}
/**
 * Get all closed Hachiko PRs for a specific migration
 */
export async function getClosedHachikoPRs(context, migrationId, logger) {
    return await getHachikoPRs(context, migrationId, "closed", logger);
}
/**
 * Get all Hachiko PRs for a specific migration and state
 */
export async function getHachikoPRs(context, migrationId, state, logger) {
    const log = logger || createLogger("pr-detection");
    try {
        // Search using multiple methods to ensure we catch all PRs
        const foundPRs = new Map();
        // Method 1: Search by branch prefix - GitHub API doesn't support prefix search,
        // so we need to get all PRs and filter by branch name pattern
        const allPRsResponse = await context.octokit.pulls.list({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            state: state === "all" ? "all" : state,
            per_page: 100,
        });
        const branchPRs = allPRsResponse.data.filter((pr) => pr.head.ref.startsWith(`hachiko/${migrationId}`));
        for (const pr of branchPRs) {
            const hachikoPR = detectHachikoPR(pr);
            if (hachikoPR && hachikoPR.migrationId === migrationId) {
                foundPRs.set(pr.number, hachikoPR);
            }
        }
        // Method 2: Search by label - we can reuse the same PR list we fetched
        const labeledPRs = [];
        for (const pr of allPRsResponse.data) {
            const hasHachikoLabel = pr.labels.some((l) => typeof l === "object" && l.name === "hachiko:migration");
            if (hasHachikoLabel) {
                labeledPRs.push(pr);
                const hachikoPR = detectHachikoPR(pr);
                if (hachikoPR && hachikoPR.migrationId === migrationId) {
                    foundPRs.set(pr.number, hachikoPR);
                }
            }
        }
        // Method 3: Check commit messages for labeled PRs that didn't match yet
        // This handles cloud agents (Cursor, Devin) that put tracking tokens in commits
        for (const pr of labeledPRs) {
            if (foundPRs.has(pr.number)) {
                continue; // Already found via other methods
            }
            try {
                // Fetch commits for this PR to check for tracking tokens
                const commitsResponse = await context.octokit.pulls.listCommits({
                    owner: context.payload.repository.owner.login,
                    repo: context.payload.repository.name,
                    pull_number: pr.number,
                    per_page: 10, // Only check first 10 commits
                });
                // Check commit messages for tracking tokens (must be at start of message per agent instructions)
                for (const commit of commitsResponse.data) {
                    const commitMessage = commit.commit.message;
                    const trackingMatch = commitMessage.match(/^hachiko-track:([^:\s]+)/m);
                    if (trackingMatch && trackingMatch[1] === migrationId) {
                        // Found matching tracking token in commit
                        const hachikoPR = {
                            number: pr.number,
                            title: pr.title,
                            state: pr.state,
                            migrationId,
                            branch: pr.head.ref,
                            labels: pr.labels.map((l) => (typeof l === "object" ? l.name : l)),
                            url: pr.html_url,
                            merged: pr.merged_at !== null,
                        };
                        foundPRs.set(pr.number, hachikoPR);
                        log.debug({ prNumber: pr.number, migrationId, commit: commit.sha.substring(0, 7) }, "Found Hachiko PR via commit message tracking token");
                        break; // Found it, no need to check more commits
                    }
                }
            }
            catch (error) {
                log.warn({ error, prNumber: pr.number }, "Failed to fetch commits for PR, skipping commit-based detection");
            }
        }
        const results = Array.from(foundPRs.values());
        log.info({ migrationId, state, foundPRs: results.length }, "Found Hachiko PRs for migration");
        return results;
    }
    catch (error) {
        log.error({ error, migrationId, state }, "Failed to get Hachiko PRs");
        throw error;
    }
}
/**
 * Get all open Hachiko PRs across all migrations
 */
export async function getAllOpenHachikoPRs(context, logger) {
    const log = logger || createLogger("pr-detection");
    try {
        const allOpenPRs = await context.octokit.pulls.list({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            state: "open",
            per_page: 100,
        });
        const hachikoPRs = [];
        for (const pr of allOpenPRs.data) {
            const hachikoPR = detectHachikoPR(pr);
            if (hachikoPR) {
                hachikoPRs.push(hachikoPR);
            }
        }
        log.info({ totalOpenPRs: allOpenPRs.data.length, hachikoOpenPRs: hachikoPRs.length }, "Found all open Hachiko PRs");
        return hachikoPRs;
    }
    catch (error) {
        log.error({ error }, "Failed to get all open Hachiko PRs");
        throw error;
    }
}
export function validateHachikoPR(pr) {
    const identificationMethods = [];
    const recommendations = [];
    let migrationId = null;
    // Check branch naming
    const branchMigrationId = extractMigrationIdFromBranch(pr.head.ref);
    if (branchMigrationId) {
        migrationId = branchMigrationId;
        identificationMethods.push("branch");
    }
    else {
        recommendations.push(`Branch should be named 'hachiko/{migration-id}' or 'hachiko/{migration-id}-description'`);
    }
    // Check labels
    const hasLabel = pr.labels.some((l) => l.name === "hachiko:migration");
    if (hasLabel) {
        identificationMethods.push("label");
    }
    else {
        recommendations.push(`Add label 'hachiko:migration' to the PR`);
    }
    // Check title
    const titleMatch = pr.title.match(/\[([^\]]+)\]/);
    if (titleMatch && titleMatch[1]) {
        identificationMethods.push("title");
        if (!migrationId) {
            migrationId = titleMatch[1];
        }
    }
    else {
        recommendations.push(`Include '[{migration-id}]' somewhere in the PR title`);
    }
    return {
        isValid: identificationMethods.length >= 2, // At least 2 methods for reliability
        migrationId,
        identificationMethods,
        recommendations: identificationMethods.length < 2 ? recommendations : [],
    };
}
//# sourceMappingURL=pr-detection.js.map