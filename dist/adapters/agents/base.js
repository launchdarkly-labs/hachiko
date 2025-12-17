import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { minimatch } from "minimatch";
import { AgentExecutionError } from "../../utils/errors.js";
import { createLogger } from "../../utils/logger.js";
/**
 * Default HTTP client implementation using fetch
 */
export class DefaultHttpClient {
    async get(url, options = {}) {
        return fetch(url, { method: "GET", ...options });
    }
    async post(url, body, options = {}) {
        const requestInit = {
            method: "POST",
            headers: { "Content-Type": "application/json", ...options.headers },
            ...options,
        };
        if (body !== undefined) {
            requestInit.body = JSON.stringify(body);
        }
        return fetch(url, requestInit);
    }
    async put(url, body, options = {}) {
        const requestInit = {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...options.headers },
            ...options,
        };
        if (body !== undefined) {
            requestInit.body = JSON.stringify(body);
        }
        return fetch(url, requestInit);
    }
    async delete(url, options = {}) {
        return fetch(url, { method: "DELETE", ...options });
    }
}
const logger = createLogger("agent-adapter");
/**
 * Base agent adapter with common functionality for cloud-based agents
 */
export class BaseAgentAdapter {
    policyConfig;
    httpClient;
    constructor(policyConfig, httpClient) {
        this.policyConfig = policyConfig;
        this.httpClient = httpClient || new DefaultHttpClient();
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
                if (minimatch(relativePath, blockedPattern)) {
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
                const isAllowed = this.policyConfig.allowedPaths.some((pattern) => minimatch(relativePath, pattern));
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
                const stats = await fs.stat(file);
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
        const absoluteFilePath = resolve(filePath);
        const absoluteRepoPath = resolve(repoPath);
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
        const workspacePath = join("/tmp", workspaceId);
        try {
            await fs.mkdir(workspacePath, { recursive: true });
            // Copy allowed files to workspace
            for (const file of files) {
                const relativePath = this.getRelativePath(file, repoPath);
                const sourcePath = resolve(repoPath, relativePath);
                const targetPath = join(workspacePath, relativePath);
                // Ensure target directory exists
                await fs.mkdir(join(targetPath, ".."), { recursive: true });
                try {
                    await fs.copyFile(sourcePath, targetPath);
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
            throw new AgentExecutionError(`Failed to prepare workspace: ${error instanceof Error ? error.message : String(error)}`, this.name);
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
                const workspaceFilePath = join(workspacePath, relativePath);
                const repoFilePath = resolve(repoPath, relativePath);
                try {
                    const _workspaceStats = await fs.stat(workspaceFilePath);
                    try {
                        const _repoStats = await fs.stat(repoFilePath);
                        // File exists in both - check if modified
                        const workspaceContent = await fs.readFile(workspaceFilePath, "utf-8");
                        const repoContent = await fs.readFile(repoFilePath, "utf-8");
                        if (workspaceContent !== repoContent) {
                            await fs.copyFile(workspaceFilePath, repoFilePath);
                            modifiedFiles.push(relativePath);
                            logger.debug({ file: relativePath }, "File modified");
                        }
                    }
                    catch {
                        // File doesn't exist in repo - it's a new file
                        await fs.mkdir(join(repoFilePath, ".."), { recursive: true });
                        await fs.copyFile(workspaceFilePath, repoFilePath);
                        createdFiles.push(relativePath);
                        logger.debug({ file: relativePath }, "File created");
                    }
                }
                catch {
                    // File doesn't exist in workspace - might have been deleted
                    try {
                        await fs.stat(repoFilePath);
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
            throw new AgentExecutionError(`Failed to copy results: ${error instanceof Error ? error.message : String(error)}`, this.name);
        }
    }
    /**
     * Clean up workspace
     */
    async cleanupWorkspace(workspacePath) {
        try {
            await fs.rm(workspacePath, { recursive: true, force: true });
            logger.debug({ workspacePath }, "Cleaned up workspace");
        }
        catch (error) {
            logger.warn({ error, workspacePath }, "Failed to cleanup workspace");
        }
    }
    /**
     * Make authenticated HTTP request with error handling
     */
    async makeAuthenticatedRequest(method, url, options = {}) {
        const { body, headers = {}, timeout = 30000 } = options;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            let response;
            switch (method) {
                case "GET":
                    response = await this.httpClient.get(url, { headers, signal: controller.signal });
                    break;
                case "POST":
                    response = await this.httpClient.post(url, body, { headers, signal: controller.signal });
                    break;
                case "PUT":
                    response = await this.httpClient.put(url, body, { headers, signal: controller.signal });
                    break;
                case "DELETE":
                    response = await this.httpClient.delete(url, { headers, signal: controller.signal });
                    break;
            }
            clearTimeout(timeoutId);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                return response.json();
            }
            else {
                return response.text();
            }
        }
        catch (error) {
            logger.error({ error, method, url }, "HTTP request failed");
            throw new AgentExecutionError(`HTTP request failed: ${error instanceof Error ? error.message : String(error)}`, this.name);
        }
    }
    /**
     * Poll for completion status with exponential backoff
     */
    async pollForCompletion(statusUrl, options = {}) {
        const { headers = {}, maxAttempts = 60, initialDelay = 1000, maxDelay = 30000, isComplete = () => false, timeout = 300000, // 5 minutes
         } = options;
        const startTime = Date.now();
        let attempt = 0;
        let delay = initialDelay;
        while (attempt < maxAttempts && Date.now() - startTime < timeout) {
            try {
                const response = await this.makeAuthenticatedRequest("GET", statusUrl, { headers });
                if (isComplete(response)) {
                    return response;
                }
                attempt++;
                await new Promise((resolve) => setTimeout(resolve, delay));
                delay = Math.min(delay * 1.5, maxDelay);
            }
            catch (error) {
                logger.warn({ error, attempt, statusUrl }, "Polling attempt failed");
                if (attempt >= maxAttempts - 1) {
                    throw error;
                }
                attempt++;
                await new Promise((resolve) => setTimeout(resolve, delay));
                delay = Math.min(delay * 1.5, maxDelay);
            }
        }
        throw new AgentExecutionError(`Polling timeout after ${maxAttempts} attempts or ${timeout}ms`, this.name);
    }
}
//# sourceMappingURL=base.js.map