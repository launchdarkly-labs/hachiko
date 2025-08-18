"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseAgentAdapter = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const minimatch_1 = require("minimatch");
const errors_js_1 = require("../../utils/errors.js");
const logger_js_1 = require("../../utils/logger.js");
const logger = (0, logger_js_1.createLogger)("agent-adapter");
/**
 * Base agent adapter with common functionality
 */
class BaseAgentAdapter {
    policyConfig;
    constructor(policyConfig) {
        this.policyConfig = policyConfig;
    }
    /**
     * Enforce policy restrictions on file access
     */
    async enforceFilePolicy(files, repoPath) {
        const violations = [];
        let allowed = true;
        for (const file of files) {
            const relativePath = this.getRelativePath(file, repoPath);
            // Check against blocked paths
            for (const blockedPattern of this.policyConfig.blockedPaths) {
                if ((0, minimatch_1.minimatch)(relativePath, blockedPattern)) {
                    violations.push({
                        type: "file_access",
                        message: `Access to blocked path: ${relativePath}`,
                        pattern: blockedPattern,
                        severity: "error",
                    });
                    allowed = false;
                }
            }
            // Check against allowed paths (if any are specified)
            if (this.policyConfig.allowedPaths.length > 0) {
                const isAllowed = this.policyConfig.allowedPaths.some((pattern) => (0, minimatch_1.minimatch)(relativePath, pattern));
                if (!isAllowed) {
                    violations.push({
                        type: "file_access",
                        message: `Access to non-allowlisted path: ${relativePath}`,
                        pattern: "not_in_allowlist",
                        severity: "error",
                    });
                    allowed = false;
                }
            }
            // Check file size if file exists
            try {
                const stats = await node_fs_1.promises.stat(file);
                if (stats.size > this.policyConfig.maxFileSize) {
                    violations.push({
                        type: "file_size",
                        message: `File too large: ${relativePath} (${stats.size} bytes > ${this.policyConfig.maxFileSize})`,
                        pattern: "max_file_size",
                        severity: "error",
                    });
                    allowed = false;
                }
            }
            catch (_error) {
                // File doesn't exist yet (might be created by agent) - that's okay
            }
        }
        return { allowed, violations };
    }
    /**
     * Enforce policy restrictions on command execution
     */
    enforceCommandPolicy(command) {
        const violations = [];
        let allowed = true;
        for (const dangerousPattern of this.policyConfig.dangerousPatterns) {
            if (command.includes(dangerousPattern)) {
                violations.push({
                    type: "command_execution",
                    message: `Dangerous command detected: ${dangerousPattern}`,
                    pattern: dangerousPattern,
                    severity: "error",
                });
                allowed = false;
            }
        }
        return { allowed, violations };
    }
    /**
     * Get relative path from repository root
     */
    getRelativePath(filePath, repoPath) {
        const absoluteFilePath = (0, node_path_1.resolve)(filePath);
        const absoluteRepoPath = (0, node_path_1.resolve)(repoPath);
        if (absoluteFilePath.startsWith(absoluteRepoPath)) {
            return absoluteFilePath.slice(absoluteRepoPath.length + 1);
        }
        return filePath;
    }
    /**
     * Prepare safe working directory with only allowed files
     */
    async prepareSafeWorkspace(input) {
        const { repoPath, files } = input;
        // Create temporary workspace
        const workspaceId = `hachiko-${input.planId}-${input.stepId}-${Date.now()}`;
        const workspacePath = (0, node_path_1.join)("/tmp", workspaceId);
        try {
            await node_fs_1.promises.mkdir(workspacePath, { recursive: true });
            // Copy allowed files to workspace
            for (const file of files) {
                const relativePath = this.getRelativePath(file, repoPath);
                const sourcePath = (0, node_path_1.resolve)(repoPath, relativePath);
                const targetPath = (0, node_path_1.join)(workspacePath, relativePath);
                // Ensure target directory exists
                await node_fs_1.promises.mkdir((0, node_path_1.join)(targetPath, ".."), { recursive: true });
                try {
                    await node_fs_1.promises.copyFile(sourcePath, targetPath);
                    logger.debug({ sourcePath, targetPath }, "Copied file to workspace");
                }
                catch (error) {
                    // File might not exist yet - that's okay for files the agent will create
                    logger.debug({ sourcePath, error }, "File not found, skipping copy");
                }
            }
            return workspacePath;
        }
        catch (error) {
            logger.error({ error, workspacePath }, "Failed to prepare workspace");
            throw new errors_js_1.AgentExecutionError(`Failed to prepare workspace: ${error instanceof Error ? error.message : String(error)}`, this.name);
        }
    }
    /**
     * Copy results back from workspace to repository
     */
    async copyResultsBack(workspacePath, repoPath, allowedFiles) {
        const modifiedFiles = [];
        const createdFiles = [];
        const deletedFiles = [];
        try {
            // Check each allowed file for changes
            for (const file of allowedFiles) {
                const relativePath = this.getRelativePath(file, repoPath);
                const workspaceFilePath = (0, node_path_1.join)(workspacePath, relativePath);
                const repoFilePath = (0, node_path_1.resolve)(repoPath, relativePath);
                try {
                    const _workspaceStats = await node_fs_1.promises.stat(workspaceFilePath);
                    try {
                        const _repoStats = await node_fs_1.promises.stat(repoFilePath);
                        // File exists in both - check if modified
                        const workspaceContent = await node_fs_1.promises.readFile(workspaceFilePath, "utf-8");
                        const repoContent = await node_fs_1.promises.readFile(repoFilePath, "utf-8");
                        if (workspaceContent !== repoContent) {
                            await node_fs_1.promises.copyFile(workspaceFilePath, repoFilePath);
                            modifiedFiles.push(relativePath);
                            logger.debug({ file: relativePath }, "File modified");
                        }
                    }
                    catch {
                        // File doesn't exist in repo - it's a new file
                        await node_fs_1.promises.mkdir((0, node_path_1.join)(repoFilePath, ".."), { recursive: true });
                        await node_fs_1.promises.copyFile(workspaceFilePath, repoFilePath);
                        createdFiles.push(relativePath);
                        logger.debug({ file: relativePath }, "File created");
                    }
                }
                catch {
                    // File doesn't exist in workspace - might have been deleted
                    try {
                        await node_fs_1.promises.stat(repoFilePath);
                        // File exists in repo but not workspace - mark as deleted
                        // Note: We don't actually delete it here for safety
                        deletedFiles.push(relativePath);
                        logger.debug({ file: relativePath }, "File marked for deletion");
                    }
                    catch {
                        // File doesn't exist in either place - nothing to do
                    }
                }
            }
            return { modifiedFiles, createdFiles, deletedFiles };
        }
        catch (error) {
            logger.error({ error, workspacePath, repoPath }, "Failed to copy results back");
            throw new errors_js_1.AgentExecutionError(`Failed to copy results: ${error instanceof Error ? error.message : String(error)}`, this.name);
        }
    }
    /**
     * Clean up workspace
     */
    async cleanupWorkspace(workspacePath) {
        try {
            await node_fs_1.promises.rm(workspacePath, { recursive: true, force: true });
            logger.debug({ workspacePath }, "Cleaned up workspace");
        }
        catch (error) {
            logger.warn({ error, workspacePath }, "Failed to cleanup workspace");
        }
    }
}
exports.BaseAgentAdapter = BaseAgentAdapter;
//# sourceMappingURL=base.js.map