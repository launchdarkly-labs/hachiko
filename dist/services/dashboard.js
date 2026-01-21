/**
 * Service for generating migration dashboards using state inference
 * Replaces frontmatter-based state tracking with PR activity analysis
 */
import { createLogger } from "../utils/logger.js";
import { getMultipleMigrationStates, getMigrationStateSummary, } from "./state-inference.js";
import { parseMigrationDocumentContent } from "../utils/migration-document.js";
/**
 * Generate complete migration dashboard with inferred states
 */
export async function generateMigrationDashboard(context, logger) {
    const log = logger || createLogger("dashboard");
    try {
        // Discover all migration documents
        const migrationFiles = await discoverMigrationDocuments(context, log);
        if (migrationFiles.length === 0) {
            log.info("No migration documents found");
            return createEmptyDashboard();
        }
        // Parse migration documents to extract IDs and metadata
        const migrationMeta = await Promise.all(migrationFiles.map(async (filePath) => {
            try {
                const content = await getMigrationDocumentFromRepo(context, filePath, "main", log);
                if (!content) {
                    log.warn({ filePath }, "Could not read migration document");
                    return null;
                }
                const parsed = parseMigrationDocumentContent(content);
                return {
                    id: parsed.frontmatter.id,
                    title: parsed.frontmatter.title,
                    filePath,
                };
            }
            catch (error) {
                log.error({ error, filePath }, "Failed to parse migration document");
                return null;
            }
        }));
        const validMigrations = migrationMeta.filter((m) => m !== null);
        const migrationIds = validMigrations.map((m) => m.id);
        // Get states for all migrations in parallel
        const migrationStates = await getMultipleMigrationStates(context, migrationIds, "main", log);
        // Build dashboard entries
        const entries = [];
        for (const migration of validMigrations) {
            const stateInfo = migrationStates.get(migration.id);
            if (stateInfo) {
                entries.push({
                    id: migration.id,
                    title: migration.title,
                    state: stateInfo.state,
                    stateInfo,
                    summary: getMigrationStateSummary(stateInfo),
                    filePath: migration.filePath,
                });
            }
        }
        // Group by state
        const dashboard = {
            lastUpdated: new Date().toISOString(),
            totalMigrations: entries.length,
            pending: entries.filter((e) => e.state === "pending"),
            active: entries.filter((e) => e.state === "active"),
            paused: entries.filter((e) => e.state === "paused"),
            completed: entries.filter((e) => e.state === "completed"),
        };
        log.info({
            totalMigrations: dashboard.totalMigrations,
            pending: dashboard.pending.length,
            active: dashboard.active.length,
            paused: dashboard.paused.length,
            completed: dashboard.completed.length,
        }, "Generated migration dashboard");
        return dashboard;
    }
    catch (error) {
        log.error({ error }, "Failed to generate migration dashboard");
        throw error;
    }
}
/**
 * Generate markdown representation of the dashboard
 */
export function generateDashboardMarkdown(dashboard) {
    const { lastUpdated, totalMigrations, pending, active, paused, completed } = dashboard;
    let markdown = `# Migration Dashboard\n\n`;
    markdown += `**Last Updated:** ${new Date(lastUpdated).toLocaleString()}\n`;
    markdown += `**Total Migrations:** ${totalMigrations}\n\n`;
    // Summary table
    markdown += `## Summary\n\n`;
    markdown += `| State | Count |\n`;
    markdown += `|-------|-------|\n`;
    markdown += `| \ud83d\udd70\ufe0f Pending | ${pending.length} |\n`;
    markdown += `| \ud83d\ude80 Active | ${active.length} |\n`;
    markdown += `| \u23f8\ufe0f Paused | ${paused.length} |\n`;
    markdown += `| \u2705 Completed | ${completed.length} |\n\n`;
    // Active migrations (highest priority)
    if (active.length > 0) {
        markdown += `## \ud83d\ude80 Active Migrations\n\n`;
        for (const entry of active) {
            markdown += formatMigrationEntry(entry);
        }
        markdown += `\n`;
    }
    // Paused migrations (need attention)
    if (paused.length > 0) {
        markdown += `## \u23f8\ufe0f Paused Migrations\n\n`;
        for (const entry of paused) {
            markdown += formatMigrationEntry(entry);
        }
        markdown += `\n`;
    }
    // Pending migrations
    if (pending.length > 0) {
        markdown += `## \ud83d\udd70\ufe0f Pending Migrations\n\n`;
        for (const entry of pending) {
            markdown += formatMigrationEntry(entry);
        }
        markdown += `\n`;
    }
    // Completed migrations (collapsible section)
    if (completed.length > 0) {
        markdown += `<details>\n<summary>\ud83d\udc88 Completed Migrations (${completed.length})</summary>\n\n`;
        for (const entry of completed) {
            markdown += formatMigrationEntry(entry);
        }
        markdown += `\n</details>\n\n`;
    }
    // Footer
    markdown += `---\n\n`;
    markdown += `*Dashboard generated using [Hachiko](https://github.com/launchdarkly/hachiko) state inference*\n`;
    return markdown;
}
/**
 * Format a single migration entry for the dashboard
 */
function formatMigrationEntry(entry) {
    const { id, title, stateInfo } = entry;
    // Build status line with PR links
    let statusLine = `**${title}** (\`${id}\`)`;
    if (stateInfo.openPRs.length > 0) {
        const prLinks = stateInfo.openPRs.map((pr) => `[PR #${pr.number}](${pr.url})`).join(", ");
        statusLine += ` - ${prLinks}`;
    }
    // Add task progress if available
    if (stateInfo.totalTasks > 0) {
        const progress = `${stateInfo.completedTasks}/${stateInfo.totalTasks}`;
        const progressBar = generateProgressBar(stateInfo.completedTasks, stateInfo.totalTasks);
        statusLine += `\\n  ${progressBar} ${progress} tasks completed`;
    }
    return `- ${statusLine}\\n`;
}
/**
 * Generate a simple text-based progress bar
 */
function generateProgressBar(completed, total) {
    if (total === 0)
        return "";
    const percentage = completed / total;
    const filled = Math.floor(percentage * 10);
    const empty = 10 - filled;
    return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}
/**
 * Create an empty dashboard
 */
function createEmptyDashboard() {
    return {
        lastUpdated: new Date().toISOString(),
        totalMigrations: 0,
        pending: [],
        active: [],
        paused: [],
        completed: [],
    };
}
/**
 * Discover migration document files in the repository
 */
async function discoverMigrationDocuments(context, logger) {
    const log = logger || createLogger("dashboard");
    try {
        // List files in the migrations directory
        const files = await context.octokit.repos.getContent({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            path: "migrations",
            ref: "main",
        });
        if (!Array.isArray(files.data)) {
            log.warn("migrations directory is not a directory or is empty");
            return [];
        }
        // Filter for markdown files
        const migrationFiles = files.data
            .filter((file) => file.type === "file" && file.name.endsWith(".md"))
            .map((file) => file.path);
        log.info({ filesFound: migrationFiles.length }, "Discovered migration documents");
        return migrationFiles;
    }
    catch (error) {
        if (error && typeof error === "object" && "status" in error && error.status === 404) {
            log.info("migrations directory not found");
            return [];
        }
        log.error({ error }, "Failed to discover migration documents");
        throw error;
    }
}
/**
 * Get migration document content from GitHub repository
 */
async function getMigrationDocumentFromRepo(context, filePath, ref = "main", logger) {
    const log = logger || createLogger("dashboard");
    try {
        const response = await context.octokit.repos.getContent({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            path: filePath,
            ref,
        });
        if ("content" in response.data && typeof response.data.content === "string") {
            return Buffer.from(response.data.content, "base64").toString("utf-8");
        }
        return null;
    }
    catch (error) {
        if (error && typeof error === "object" && "status" in error && error.status === 404) {
            return null;
        }
        log.error({ error, filePath, ref }, "Failed to get migration document from repo");
        throw error;
    }
}
/**
 * Update dashboard and commit to repository
 * This would be called by webhooks or scheduled jobs
 */
export async function updateDashboardInRepo(context, dashboardPath = "MIGRATION_DASHBOARD.md", logger) {
    const log = logger || createLogger("dashboard");
    try {
        // Generate new dashboard
        const dashboard = await generateMigrationDashboard(context, log);
        const markdown = generateDashboardMarkdown(dashboard);
        // Get current file SHA (if it exists)
        let currentSha;
        try {
            const current = await context.octokit.repos.getContent({
                owner: context.payload.repository.owner.login,
                repo: context.payload.repository.name,
                path: dashboardPath,
                ref: "main",
            });
            if ("sha" in current.data) {
                currentSha = current.data.sha;
            }
        }
        catch (error) {
            // File doesn't exist yet, that's fine
            if (error && typeof error === "object" && "status" in error && error.status !== 404) {
                throw error;
            }
        }
        // Create or update the file
        const message = `Update migration dashboard - ${dashboard.totalMigrations} migrations (${dashboard.active.length} active, ${dashboard.paused.length} paused, ${dashboard.completed.length} completed)`;
        const updateParams = {
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            path: dashboardPath,
            message,
            content: Buffer.from(markdown).toString("base64"),
            branch: "main",
        };
        if (currentSha) {
            updateParams.sha = currentSha;
        }
        await context.octokit.repos.createOrUpdateFileContents(updateParams);
        log.info({
            dashboardPath,
            totalMigrations: dashboard.totalMigrations,
            active: dashboard.active.length,
            paused: dashboard.paused.length,
            completed: dashboard.completed.length,
        }, "Updated migration dashboard in repository");
    }
    catch (error) {
        log.error({ error, dashboardPath }, "Failed to update dashboard in repository");
        throw error;
    }
}
//# sourceMappingURL=dashboard.js.map