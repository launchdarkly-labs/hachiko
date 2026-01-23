#!/usr/bin/env node
/**
 * CLI script to get calculated migration state for GitHub Actions workflows
 * Usage: pnpm get-migration-state <migration_id>
 */
import { Octokit } from "@octokit/rest";
import { getMigrationStateWithDocument } from "../services/state-inference.js";
import { createLogger } from "../utils/logger.js";
async function main() {
    const migrationId = process.argv[2];
    if (!migrationId) {
        console.error("Usage: pnpm get-migration-state <migration_id>");
        process.exit(1);
    }
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        console.error("GITHUB_TOKEN environment variable is required");
        process.exit(1);
    }
    const repository = process.env.GITHUB_REPOSITORY;
    if (!repository) {
        console.error("GITHUB_REPOSITORY environment variable is required");
        process.exit(1);
    }
    const [owner, repo] = repository.split("/");
    if (!owner || !repo) {
        console.error("Invalid GITHUB_REPOSITORY format. Expected: owner/repo");
        process.exit(1);
    }
    try {
        const octokit = new Octokit({ auth: token });
        const logger = createLogger("get-migration-state");
        // Create a minimal context object for the state inference
        const context = {
            octokit,
            payload: {
                repository: {
                    owner: { login: owner },
                    name: repo,
                },
            },
        };
        const stateInfo = await getMigrationStateWithDocument(context, migrationId, "main", logger);
        // Output in GitHub Actions format
        console.log(`migration_id=${migrationId}`);
        console.log(`status=${stateInfo.state}`);
        console.log(`current_step=${stateInfo.currentStep}`);
        console.log(`total_tasks=${stateInfo.totalTasks}`);
        console.log(`completed_tasks=${stateInfo.completedTasks}`);
        console.log(`open_prs=${stateInfo.openPRs.length}`);
        console.log(`closed_prs=${stateInfo.closedPRs.length}`);
        console.log(`last_updated=${stateInfo.lastUpdated}`);
        // For debugging
        logger.info({
            migrationId,
            state: stateInfo.state,
            currentStep: stateInfo.currentStep,
            openPRs: stateInfo.openPRs.length,
            closedPRs: stateInfo.closedPRs.length,
        }, "Migration state calculated successfully");
    }
    catch (error) {
        console.error("Failed to get migration state:", error);
        process.exit(1);
    }
}
main().catch((error) => {
    console.error("Unexpected error:", error);
    process.exit(1);
});
//# sourceMappingURL=get-migration-state.js.map