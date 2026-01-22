import { AgentExecutionError } from "../../utils/errors.js";
import { createLogger } from "../../utils/logger.js";
import { BaseAgentAdapter } from "./base.js";
const logger = createLogger("devin-cloud-adapter");
/**
 * Devin Cloud API agent adapter
 */
export class DevinCloudAdapter extends BaseAgentAdapter {
    name = "devin-cloud";
    devinConfig;
    baseUrl;
    apiVersion;
    constructor(policyConfig, devinConfig) {
        super(policyConfig);
        this.devinConfig = devinConfig;
        this.baseUrl = devinConfig.baseUrl || "https://api.devin.ai";
        this.apiVersion = devinConfig.apiVersion || "v1";
    }
    async validate() {
        try {
            // For API v3, organizationId may be required depending on service user type
            if (this.apiVersion === "v3" && !this.devinConfig.organizationId) {
                logger.warn("Devin API v3: No organizationId provided. This may be required for Organization Service Users.");
            }
            // Test API connectivity and authentication
            let testUrl;
            if ((this.apiVersion === "v3" || this.apiVersion === "v3beta1") &&
                this.devinConfig.organizationId) {
                // v3/v3beta1 requires org ID in URL path: /v3beta1/organizations/{orgId}/sessions
                testUrl = `${this.baseUrl}/${this.apiVersion}/organizations/${this.devinConfig.organizationId}/sessions`;
            }
            else if (this.apiVersion === "v3" || this.apiVersion === "v3beta1") {
                throw new Error("Devin v3/v3beta1 API requires organizationId");
            }
            else {
                // v1/v2 use simple /health endpoint
                testUrl = `${this.baseUrl}/${this.apiVersion}/health`;
            }
            const response = await this.makeAuthenticatedRequest("GET", testUrl, {
                headers: this.getAuthHeaders(),
                timeout: 10000,
            });
            logger.info({ response }, "Devin API validation successful");
            return true;
        }
        catch (error) {
            logger.error({ error }, "Devin API validation failed");
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
            // Create Devin session
            const sessionRequest = {
                prompt: this.buildPrompt(input),
                files: input.files.map((f) => this.getRelativePath(f, input.repoPath)),
                repository_path: input.repoPath,
                webhook_url: this.devinConfig.webhookUrl,
                metadata: {
                    plan_id: input.planId,
                    step_id: input.stepId,
                    ...(input.chunk && { chunk: input.chunk }),
                },
            };
            // Build session creation URL
            let createUrl;
            if ((this.apiVersion === "v3" || this.apiVersion === "v3beta1") &&
                this.devinConfig.organizationId) {
                createUrl = `${this.baseUrl}/${this.apiVersion}/organizations/${this.devinConfig.organizationId}/sessions`;
            }
            else {
                createUrl = `${this.baseUrl}/${this.apiVersion}/sessions`;
            }
            const createResponse = await this.makeAuthenticatedRequest("POST", createUrl, {
                body: sessionRequest,
                headers: this.getAuthHeaders(),
                timeout: 30000,
            });
            const sessionId = createResponse.session_id;
            logger.info({ sessionId, planId: input.planId, stepId: input.stepId }, "Devin session created");
            // Build polling URL
            let pollUrl;
            if ((this.apiVersion === "v3" || this.apiVersion === "v3beta1") &&
                this.devinConfig.organizationId) {
                pollUrl = `${this.baseUrl}/${this.apiVersion}/organizations/${this.devinConfig.organizationId}/sessions/${sessionId}`;
            }
            else {
                pollUrl = `${this.baseUrl}/${this.apiVersion}/sessions/${sessionId}`;
            }
            // Poll for completion
            const completedSession = await this.pollForCompletion(pollUrl, {
                headers: this.getAuthHeaders(),
                maxAttempts: 120, // 10 minutes with 5s intervals
                initialDelay: 5000,
                maxDelay: 30000,
                isComplete: (session) => ["completed", "failed", "cancelled"].includes(session.status),
                timeout: this.devinConfig.timeout ? this.devinConfig.timeout * 1000 : 600000, // 10 minutes default
            });
            const success = completedSession.status === "completed";
            const executionTime = Date.now() - startTime;
            const result = {
                success,
                modifiedFiles: completedSession.output?.files_modified || [],
                createdFiles: completedSession.output?.files_created || [],
                deletedFiles: completedSession.output?.files_deleted || [],
                output: completedSession.output?.summary || "",
                error: success ? undefined : completedSession.output?.error,
                exitCode: success ? 0 : 1,
                executionTime,
            };
            logger.info({
                sessionId,
                planId: input.planId,
                stepId: input.stepId,
                success,
                executionTime,
                modifiedFiles: result.modifiedFiles.length,
                createdFiles: result.createdFiles.length,
            }, "Devin session completed");
            return result;
        }
        catch (error) {
            const executionTime = Date.now() - startTime;
            logger.error({
                error,
                planId: input.planId,
                stepId: input.stepId,
                executionTime,
            }, "Devin session failed");
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
    getConfig() {
        return {
            name: this.name,
            baseUrl: this.baseUrl,
            apiVersion: this.apiVersion,
            timeout: this.devinConfig.timeout,
            hasApiKey: !!this.devinConfig.apiKey,
            hasWebhook: !!this.devinConfig.webhookUrl,
        };
    }
    /**
     * Get authentication headers for Devin API
     */
    getAuthHeaders() {
        const headers = {
            Authorization: `Bearer ${this.devinConfig.apiKey}`,
            "User-Agent": "Hachiko/1.0",
        };
        // For API v3, include organization ID in headers if available
        if (this.apiVersion === "v3" && this.devinConfig.organizationId) {
            headers["X-Organization-ID"] = this.devinConfig.organizationId;
        }
        return headers;
    }
    /**
     * Build comprehensive prompt for Devin
     */
    buildPrompt(input) {
        return `# Code Migration Task

## Context
- **Migration Plan**: ${input.planId}
- **Current Step**: ${input.stepId}
${input.chunk ? `- **Processing Chunk**: ${input.chunk}` : ""}

## Target Files
${input.files.map((f) => `- ${this.getRelativePath(f, input.repoPath)}`).join("\n")}

## Instructions
${input.prompt}

## Requirements
1. **File Scope**: Only modify the files listed above
2. **Safety**: Preserve existing functionality while applying changes
3. **Code Quality**: Follow the project's existing patterns and standards
4. **Atomic Changes**: Ensure all modifications are cohesive and safe
5. **Documentation**: Add comments for significant changes

## Repository Context
- Repository path: ${input.repoPath}
- This is part of an automated migration orchestrated by Hachiko
- The changes will be reviewed and integrated via GitHub Pull Request

Please analyze the target files, understand the existing code patterns, and apply the requested changes systematically while maintaining code quality and functionality.`;
    }
}
//# sourceMappingURL=devin-cloud.js.map