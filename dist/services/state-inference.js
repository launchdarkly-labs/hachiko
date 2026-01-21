/**
 * Service for inferring migration state from PR activity and task completion
 * Implements the state inference model from the migration plan
 */
import { createLogger } from "../utils/logger.js";
import { getOpenHachikoPRs, getClosedHachikoPRs } from "./pr-detection.js";
/**
 * Get the inferred state of a migration based on PR activity and task completion
 *
 * State inference rules:
 * - "pending": No hachiko PRs ever opened
 * - "active": Has open hachiko PRs
 * - "paused": No open PRs, but has closed hachiko PRs
 * - "completed": All tasks checked off in main branch migration doc
 */
export async function getMigrationState(context, migrationId, migrationDocContent, logger) {
    const log = logger || createLogger("state-inference");
    try {
        // Get PR information in parallel
        const [openPRs, closedPRs] = await Promise.all([
            getOpenHachikoPRs(context, migrationId, log),
            getClosedHachikoPRs(context, migrationId, log),
        ]);
        // Get task completion info if migration doc content is provided
        let allTasksComplete = false;
        let totalTasks = 0;
        let completedTasks = 0;
        if (migrationDocContent) {
            const taskInfo = getTaskCompletionInfo(migrationDocContent);
            allTasksComplete = taskInfo.allTasksComplete;
            totalTasks = taskInfo.totalTasks;
            completedTasks = taskInfo.completedTasks;
        }
        // Apply state inference rules
        let state;
        if (allTasksComplete && totalTasks > 0) {
            state = "completed";
        }
        else if (openPRs.length > 0) {
            state = "active";
        }
        else if (closedPRs.length > 0) {
            state = "paused";
        }
        else {
            state = "pending";
        }
        const stateInfo = {
            state,
            openPRs,
            closedPRs,
            allTasksComplete,
            totalTasks,
            completedTasks,
            lastUpdated: new Date().toISOString(),
        };
        log.info({
            migrationId,
            state,
            openPRs: openPRs.length,
            closedPRs: closedPRs.length,
            completedTasks,
            totalTasks,
        }, "Inferred migration state");
        return stateInfo;
    }
    catch (error) {
        log.error({ error, migrationId }, "Failed to get migration state");
        throw error;
    }
}
/**
 * Get task completion information from migration document content
 * Analyzes markdown checkboxes to determine completion status
 */
export function getTaskCompletionInfo(migrationDocContent) {
    // Match all markdown checkbox patterns: - [ ] or - [x] or - [X]
    const taskPattern = /^- \[([ xX])\] (.+)$/gm;
    const tasks = [];
    let match;
    while ((match = taskPattern.exec(migrationDocContent)) !== null) {
        const isCompleted = match[1] !== " "; // [x] or [X] means completed
        const text = match[2] || "";
        tasks.push({ completed: isCompleted, text });
    }
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((task) => task.completed).length;
    const allTasksComplete = totalTasks > 0 && totalTasks === completedTasks;
    return {
        allTasksComplete,
        totalTasks,
        completedTasks,
        tasks,
    };
}
/**
 * Get migration document content from GitHub API
 */
export async function getMigrationDocumentContent(context, migrationId, ref = "main", logger) {
    const log = logger || createLogger("state-inference");
    try {
        const filePath = `migrations/${migrationId}.md`;
        const response = await context.octokit.repos.getContent({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            path: filePath,
            ref,
        });
        if ("content" in response.data && typeof response.data.content === "string") {
            const content = Buffer.from(response.data.content, "base64").toString("utf-8");
            return content;
        }
        log.warn({ migrationId, filePath, ref }, "Migration document not found or not a file");
        return null;
    }
    catch (error) {
        if (error && typeof error === "object" && "status" in error && error.status === 404) {
            log.info({ migrationId, ref }, "Migration document not found");
            return null;
        }
        log.error({ error, migrationId, ref }, "Failed to get migration document content");
        throw error;
    }
}
/**
 * Get complete migration state with document content fetched from GitHub
 */
export async function getMigrationStateWithDocument(context, migrationId, ref = "main", logger) {
    const log = logger || createLogger("state-inference");
    try {
        const migrationDocContent = await getMigrationDocumentContent(context, migrationId, ref, log);
        return await getMigrationState(context, migrationId, migrationDocContent || undefined, log);
    }
    catch (error) {
        log.error({ error, migrationId, ref }, "Failed to get migration state with document");
        throw error;
    }
}
/**
 * Get states for multiple migrations in parallel
 */
export async function getMultipleMigrationStates(context, migrationIds, ref = "main", logger) {
    const log = logger || createLogger("state-inference");
    try {
        const statePromises = migrationIds.map(async (migrationId) => {
            try {
                const state = await getMigrationStateWithDocument(context, migrationId, ref, log);
                return [migrationId, state];
            }
            catch (error) {
                log.error({ error, migrationId }, "Failed to get state for migration");
                // Return default state info for failed migrations
                return [
                    migrationId,
                    {
                        state: "pending",
                        openPRs: [],
                        closedPRs: [],
                        allTasksComplete: false,
                        totalTasks: 0,
                        completedTasks: 0,
                        lastUpdated: new Date().toISOString(),
                    },
                ];
            }
        });
        const results = await Promise.all(statePromises);
        log.info({ migrationsProcessed: results.length }, "Processed multiple migration states");
        return new Map(results);
    }
    catch (error) {
        log.error({ error, migrationIds }, "Failed to get multiple migration states");
        throw error;
    }
}
/**
 * Check if a migration document has been updated recently
 * This can be used to detect when agents have made progress
 */
export async function getMigrationDocumentLastUpdated(context, migrationId, ref = "main", logger) {
    const log = logger || createLogger("state-inference");
    try {
        const filePath = `migrations/${migrationId}.md`;
        const commits = await context.octokit.repos.listCommits({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            path: filePath,
            sha: ref,
            per_page: 1,
        });
        if (commits.data.length > 0 && commits.data[0]?.commit.committer?.date) {
            return new Date(commits.data[0].commit.committer.date);
        }
        return null;
    }
    catch (error) {
        log.error({ error, migrationId, ref }, "Failed to get migration document last updated");
        return null;
    }
}
/**
 * Generate a human-readable summary of migration state
 */
export function getMigrationStateSummary(stateInfo) {
    const { state, openPRs, closedPRs, totalTasks, completedTasks } = stateInfo;
    switch (state) {
        case "pending":
            return totalTasks > 0
                ? `Pending (${totalTasks} tasks planned, none started)`
                : "Pending (no PRs opened yet)";
        case "active":
            const prSummary = openPRs.length === 1 ? `1 open PR` : `${openPRs.length} open PRs`;
            const taskSummary = totalTasks > 0 ? ` • ${completedTasks}/${totalTasks} tasks complete` : "";
            return `Active (${prSummary}${taskSummary})`;
        case "paused":
            const closedPrSummary = closedPRs.length === 1 ? `1 closed PR` : `${closedPRs.length} closed PRs`;
            const pausedTaskSummary = totalTasks > 0 ? ` • ${completedTasks}/${totalTasks} tasks complete` : "";
            return `Paused (${closedPrSummary}, no open PRs${pausedTaskSummary})`;
        case "completed":
            return `Completed (all ${totalTasks} tasks finished)`;
        default:
            return "Unknown state";
    }
}
//# sourceMappingURL=state-inference.js.map