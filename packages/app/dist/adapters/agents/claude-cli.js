"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeCliAdapter = void 0;
const node_path_1 = require("node:path");
const base_js_1 = require("./base.js");
const container_js_1 = require("../container.js");
const errors_js_1 = require("../../utils/errors.js");
const logger_js_1 = require("../../utils/logger.js");
const logger = (0, logger_js_1.createLogger)("claude-cli-adapter");
/**
 * Claude CLI agent adapter with container sandboxing
 */
class ClaudeCliAdapter extends base_js_1.BaseAgentAdapter {
    name = "claude-cli";
    containerExecutor;
    claudeConfig;
    constructor(policyConfig, claudeConfig) {
        super(policyConfig);
        this.containerExecutor = container_js_1.ContainerExecutor.getInstance();
        this.claudeConfig = claudeConfig;
    }
    async validate() {
        try {
            // Check if Docker is available
            const dockerAvailable = await this.containerExecutor.isDockerAvailable();
            if (!dockerAvailable) {
                logger.error("Docker is not available");
                return false;
            }
            // Check if Claude CLI image is available
            const result = await this.containerExecutor.executeCommand("docker", ["image", "inspect", this.claudeConfig.image]);
            if (result.exitCode !== 0) {
                logger.warn({ image: this.claudeConfig.image }, "Claude CLI image not found, will pull on first use");
            }
            return true;
        }
        catch (error) {
            logger.error({ error }, "Claude CLI validation failed");
            return false;
        }
    }
    async execute(input) {
        const startTime = Date.now();
        let workspacePath = null;
        let containerId = null;
        try {
            // Enforce file access policy
            const policyResult = await this.enforceFilePolicy(input.files, input.repoPath);
            if (!policyResult.allowed) {
                throw new errors_js_1.AgentExecutionError(`Policy violations: ${policyResult.violations.map(v => v.message).join(", ")}`, this.name);
            }
            // Prepare safe workspace
            workspacePath = await this.prepareSafeWorkspace(input);
            // Create container
            const containerConfig = {
                image: this.claudeConfig.image,
                timeout: this.claudeConfig.timeout,
                memoryLimit: this.claudeConfig.memoryLimit || undefined,
                cpuLimit: this.claudeConfig.cpuLimit || undefined,
                workdir: "/workspace",
                env: {
                    ...(this.claudeConfig.apiKey && { ANTHROPIC_API_KEY: this.claudeConfig.apiKey }),
                    PLAN_ID: input.planId,
                    STEP_ID: input.stepId,
                    ...(input.chunk && { CHUNK: input.chunk }),
                },
            };
            const containerContext = await this.containerExecutor.createContainer(containerConfig, workspacePath, input.repoPath);
            containerId = containerContext.containerId;
            // Create prompt file
            const promptFile = (0, node_path_1.join)(workspacePath, ".hachiko-prompt.md");
            await this.writePromptFile(promptFile, input);
            // Execute Claude CLI
            const command = [
                "claude",
                "chat",
                "--prompt-file", ".hachiko-prompt.md",
                "--apply-diff",
                "--yes", // Non-interactive mode
                ...input.files.map(f => this.getRelativePath(f, input.repoPath))
            ];
            const executionResult = await this.containerExecutor.executeInContainer(containerContext, command, this.claudeConfig.timeout * 1000);
            // Copy results back to repository
            const fileChanges = await this.copyResultsBack(workspacePath, input.repoPath, input.files);
            const success = executionResult.exitCode === 0;
            const executionTime = Date.now() - startTime;
            const result = {
                success,
                modifiedFiles: fileChanges.modifiedFiles,
                createdFiles: fileChanges.createdFiles,
                deletedFiles: fileChanges.deletedFiles,
                output: executionResult.stdout,
                error: success ? undefined : executionResult.stderr,
                exitCode: executionResult.exitCode,
                executionTime,
            };
            logger.info({
                planId: input.planId,
                stepId: input.stepId,
                success,
                executionTime,
                modifiedFiles: fileChanges.modifiedFiles.length,
                createdFiles: fileChanges.createdFiles.length,
            }, "Claude CLI execution completed");
            return result;
        }
        catch (error) {
            const executionTime = Date.now() - startTime;
            logger.error({
                error,
                planId: input.planId,
                stepId: input.stepId,
                executionTime
            }, "Claude CLI execution failed");
            return {
                success: false,
                modifiedFiles: [],
                createdFiles: [],
                deletedFiles: [],
                output: "",
                error: error instanceof Error ? error.message : String(error),
                exitCode: -1,
                executionTime,
            };
        }
        finally {
            // Cleanup
            if (containerId) {
                await this.containerExecutor.destroyContainer(containerId);
            }
            if (workspacePath) {
                await this.cleanupWorkspace(workspacePath);
            }
        }
    }
    getConfig() {
        return {
            name: this.name,
            image: this.claudeConfig.image,
            timeout: this.claudeConfig.timeout,
            memoryLimit: this.claudeConfig.memoryLimit,
            cpuLimit: this.claudeConfig.cpuLimit,
            hasApiKey: !!this.claudeConfig.apiKey,
        };
    }
    /**
     * Write prompt file for Claude CLI
     */
    async writePromptFile(promptPath, input) {
        const prompt = `# Migration Task

## Context
- **Plan ID**: ${input.planId}
- **Step ID**: ${input.stepId}
${input.chunk ? `- **Chunk**: ${input.chunk}` : ""}

## Files to Modify
${input.files.map(f => `- ${this.getRelativePath(f, input.repoPath)}`).join("\n")}

## Instructions
${input.prompt}

## Guidelines
1. Only modify the specified files
2. Ensure changes are safe and backward compatible
3. Follow existing code style and patterns
4. Add appropriate comments for significant changes
5. Test your changes before applying

Please analyze the files and apply the necessary changes according to the instructions.
`;
        const fs = await import("node:fs/promises");
        await fs.writeFile(promptPath, prompt, "utf-8");
    }
}
exports.ClaudeCliAdapter = ClaudeCliAdapter;
//# sourceMappingURL=claude-cli.js.map