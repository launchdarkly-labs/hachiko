import { AgentExecutionError } from "../../utils/errors.js";
import { createLogger } from "../../utils/logger.js";
import { BaseAgentAdapter } from "./base.js";
const logger = createLogger("cursor-cloud-adapter");
/**
 * Cursor Cloud Agent API adapter
 */
export class CursorCloudAdapter extends BaseAgentAdapter {
    name = "cursor-cloud";
    cursorConfig;
    baseUrl;
    constructor(policyConfig, cursorConfig) {
        super(policyConfig);
        this.cursorConfig = cursorConfig;
        this.baseUrl = cursorConfig.baseUrl || "https://api.cursor.com";
    }
    async validate() {
        try {
            // Test API connectivity and authentication
            const response = await this.makeAuthenticatedRequest("GET", `${this.baseUrl}/v0/agents`, {
                headers: this.getAuthHeaders(),
                timeout: 10000,
            });
            logger.info({ response }, "Cursor API validation successful");
            return true;
        }
        catch (error) {
            logger.error({ error }, "Cursor API validation failed");
            return false;
        }
    }
    async execute(input) {
        const startTime = Date.now();
        try {
            // Enforce file access policy
            const policyResult = await this.enforceFilePolicy(input.files, input.repoPath);
            if (!policyResult.allowed) {
                throw new AgentExecutionError(`Policy violations: ${policyResult.violations.map((v) => v.message).join(", ")}`, this.name);
            }
            // Create Cursor agent
            const agentRequest = {
                task: this.buildTask(input),
                repository_url: this.cursorConfig.repositoryUrl || this.inferRepositoryUrl(input.repoPath),
                branch: this.cursorConfig.branch || "main",
                files: input.files.map((f) => this.getRelativePath(f, input.repoPath)),
                webhook_url: this.cursorConfig.webhookUrl,
                metadata: {
                    plan_id: input.planId,
                    step_id: input.stepId,
                    ...(input.chunk && { chunk: input.chunk }),
                },
            };
            const createResponse = await this.makeAuthenticatedRequest("POST", `${this.baseUrl}/v0/agents`, {
                body: agentRequest,
                headers: this.getAuthHeaders(),
                timeout: 30000,
            });
            const agentId = createResponse.agent.id;
            logger.info({ agentId, planId: input.planId, stepId: input.stepId }, "Cursor agent created");
            // Poll for completion
            const completedAgent = await this.pollForCompletion(`${this.baseUrl}/v0/agents/${agentId}`, {
                headers: this.getAuthHeaders(),
                maxAttempts: 240, // 20 minutes with 5s intervals
                initialDelay: 5000,
                maxDelay: 30000,
                isComplete: (agent) => ["completed", "failed", "cancelled"].includes(agent.status),
                timeout: this.cursorConfig.timeout ? this.cursorConfig.timeout * 1000 : 1200000, // 20 minutes default
            });
            const success = completedAgent.status === "completed";
            const executionTime = Date.now() - startTime;
            const result = {
                success,
                modifiedFiles: completedAgent.output?.files_modified || [],
                createdFiles: completedAgent.output?.files_created || [],
                deletedFiles: completedAgent.output?.files_deleted || [],
                output: this.formatOutput(completedAgent),
                error: success ? undefined : completedAgent.output?.error,
                exitCode: success ? 0 : 1,
                executionTime,
            };
            logger.info({
                agentId,
                planId: input.planId,
                stepId: input.stepId,
                success,
                executionTime,
                pullRequestUrl: completedAgent.output?.pull_request_url,
                modifiedFiles: result.modifiedFiles.length,
                createdFiles: result.createdFiles.length,
            }, "Cursor agent completed");
            return result;
        }
        catch (error) {
            const executionTime = Date.now() - startTime;
            logger.error({
                error,
                planId: input.planId,
                stepId: input.stepId,
                executionTime,
            }, "Cursor agent failed");
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
    }
    /**
     * Add follow-up instruction to a running agent
     */
    async addInstruction(agentId, instruction) {
        try {
            await this.makeAuthenticatedRequest("POST", `${this.baseUrl}/v0/agents/${agentId}/instructions`, {
                body: { instruction },
                headers: this.getAuthHeaders(),
                timeout: 10000,
            });
            logger.info({ agentId, instruction }, "Added instruction to Cursor agent");
        }
        catch (error) {
            logger.error({ error, agentId, instruction }, "Failed to add instruction");
            throw new AgentExecutionError(`Failed to add instruction: ${error instanceof Error ? error.message : String(error)}`, this.name);
        }
    }
    getConfig() {
        return {
            name: this.name,
            baseUrl: this.baseUrl,
            timeout: this.cursorConfig.timeout,
            repositoryUrl: this.cursorConfig.repositoryUrl,
            branch: this.cursorConfig.branch,
            hasApiKey: !!this.cursorConfig.apiKey,
            hasWebhook: !!this.cursorConfig.webhookUrl,
        };
    }
    /**
     * Get authentication headers for Cursor API
     */
    getAuthHeaders() {
        // Cursor uses Basic Auth with base64-encoded API key + ":"
        const encodedAuth = Buffer.from(`${this.cursorConfig.apiKey}:`).toString("base64");
        return {
            Authorization: `Basic ${encodedAuth}`,
            "User-Agent": "Hachiko/1.0",
        };
    }
    /**
     * Build comprehensive task description for Cursor
     */
    buildTask(input) {
        return `# Code Migration Task: ${input.planId}

**Step**: ${input.stepId}
${input.chunk ? `**Chunk**: ${input.chunk}` : ""}

## Target Files
${input.files.map((f) => `- ${this.getRelativePath(f, input.repoPath)}`).join("\n")}

## Instructions
${input.prompt}

## Guidelines
- Only modify the specified files above
- Preserve existing functionality while applying the requested changes
- Follow the project's existing code patterns and style
- Ensure changes are atomic and safe
- Add appropriate comments for significant modifications
- Create a focused pull request with clear commit messages

This is part of an automated migration orchestrated by Hachiko. Please work systematically and create a pull request when complete.`;
    }
    /**
     * Infer repository URL from local path
     */
    inferRepositoryUrl(repoPath) {
        // This is a simplified version - in practice, you'd parse .git/config
        // or use git commands to get the remote URL
        const repoName = repoPath.split("/").pop() || "unknown";
        return `https://github.com/example/${repoName}`;
    }
    /**
     * Format output from completed agent
     */
    formatOutput(agent) {
        const parts = [];
        if (agent.output?.summary) {
            parts.push(`Summary: ${agent.output.summary}`);
        }
        if (agent.output?.pull_request_url) {
            parts.push(`Pull Request: ${agent.output.pull_request_url}`);
        }
        if (agent.output?.branch_name) {
            parts.push(`Branch: ${agent.output.branch_name}`);
        }
        return parts.join("\n") || "Agent completed successfully";
    }
}
//# sourceMappingURL=cursor-cloud.js.map