import { AgentExecutionError } from "../../utils/errors.js";
import { createLogger } from "../../utils/logger.js";
import type { AgentInput, AgentResult, PolicyConfig } from "../types.js";
import { BaseAgentAdapter } from "./base.js";

const logger = createLogger("devin-cloud-adapter");

export interface DevinCloudConfig {
  /** API base URL (default: https://api.devin.ai) */
  baseUrl?: string;
  /** API key for authentication */
  apiKey: string;
  /** API version (v1, v2, v3beta1) */
  apiVersion?: string;
  /** Organization ID for v3 API */
  organizationId?: string;
  /** Request timeout in seconds */
  timeout?: number;
  /** Webhook URL for completion notifications */
  webhookUrl?: string;
}

interface DevinSession {
  id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  prompt: string;
  created_at: string;
  updated_at: string;
  output?: {
    files_modified?: string[];
    files_created?: string[];
    files_deleted?: string[];
    summary?: string;
    error?: string;
  };
}

interface CreateSessionRequest {
  prompt: string;
  files?: string[];
  repository_path?: string;
  webhook_url?: string | undefined;
  metadata?: {
    plan_id: string;
    step_id: string;
    chunk?: string;
  };
}

interface CreateSessionResponse {
  session: DevinSession;
}

/**
 * Devin Cloud API agent adapter
 */
export class DevinCloudAdapter extends BaseAgentAdapter {
  readonly name = "devin-cloud";

  private readonly devinConfig: DevinCloudConfig;
  private readonly baseUrl: string;
  private readonly apiVersion: string;

  constructor(policyConfig: PolicyConfig, devinConfig: DevinCloudConfig) {
    super(policyConfig);
    this.devinConfig = devinConfig;
    this.baseUrl = devinConfig.baseUrl || "https://api.devin.ai";
    this.apiVersion = devinConfig.apiVersion || "v1";
  }

  async validate(): Promise<boolean> {
    try {
      // Test API connectivity and authentication
      const response = await this.makeAuthenticatedRequest<{ status: string }>(
        "GET",
        `${this.baseUrl}/${this.apiVersion}/health`,
        {
          headers: this.getAuthHeaders(),
          timeout: 10000,
        }
      );

      logger.info({ response }, "Devin API validation successful");
      return true;
    } catch (error) {
      logger.error({ error }, "Devin API validation failed");
      return false;
    }
  }

  async execute(input: AgentInput): Promise<AgentResult> {
    const startTime = Date.now();

    try {
      // Enforce file access policy
      const policyResult = await this.enforceFilePolicy(input.files, input.repoPath);
      if (!policyResult.allowed) {
        throw new AgentExecutionError(
          `Policy violations: ${policyResult.violations.map((v) => v.message).join(", ")}`,
          this.name
        );
      }

      // Create Devin session
      const sessionRequest: CreateSessionRequest = {
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

      const createResponse = await this.makeAuthenticatedRequest<CreateSessionResponse>(
        "POST",
        `${this.baseUrl}/${this.apiVersion}/sessions`,
        {
          body: sessionRequest,
          headers: this.getAuthHeaders(),
          timeout: 30000,
        }
      );

      const sessionId = createResponse.session.id;
      logger.info(
        { sessionId, planId: input.planId, stepId: input.stepId },
        "Devin session created"
      );

      // Poll for completion
      const completedSession = await this.pollForCompletion<DevinSession>(
        `${this.baseUrl}/${this.apiVersion}/sessions/${sessionId}`,
        {
          headers: this.getAuthHeaders(),
          maxAttempts: 120, // 10 minutes with 5s intervals
          initialDelay: 5000,
          maxDelay: 30000,
          isComplete: (session) => ["completed", "failed", "cancelled"].includes(session.status),
          timeout: this.devinConfig.timeout ? this.devinConfig.timeout * 1000 : 600000, // 10 minutes default
        }
      );

      const success = completedSession.status === "completed";
      const executionTime = Date.now() - startTime;

      const result: AgentResult = {
        success,
        modifiedFiles: completedSession.output?.files_modified || [],
        createdFiles: completedSession.output?.files_created || [],
        deletedFiles: completedSession.output?.files_deleted || [],
        output: completedSession.output?.summary || "",
        error: success ? undefined : completedSession.output?.error,
        exitCode: success ? 0 : 1,
        executionTime,
      };

      logger.info(
        {
          sessionId,
          planId: input.planId,
          stepId: input.stepId,
          success,
          executionTime,
          modifiedFiles: result.modifiedFiles.length,
          createdFiles: result.createdFiles.length,
        },
        "Devin session completed"
      );

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error(
        {
          error,
          planId: input.planId,
          stepId: input.stepId,
          executionTime,
        },
        "Devin session failed"
      );

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

  getConfig(): Record<string, unknown> {
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
  private getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.devinConfig.apiKey}`,
      "User-Agent": "Hachiko/1.0",
    };
  }

  /**
   * Build comprehensive prompt for Devin
   */
  private buildPrompt(input: AgentInput): string {
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
