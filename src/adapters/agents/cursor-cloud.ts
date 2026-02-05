import { AgentExecutionError } from "../../utils/errors.js";
import { createLogger } from "../../utils/logger.js";
import type { AgentInput, AgentResult, PolicyConfig } from "../types.js";
import { BaseAgentAdapter } from "./base.js";

const logger = createLogger("cursor-cloud-adapter");

export interface CursorCloudConfig {
  /** API base URL (default: https://api.cursor.com) */
  baseUrl?: string;
  /** API key for authentication */
  apiKey: string;
  /** Request timeout in seconds */
  timeout?: number;
  /** Webhook URL for completion notifications */
  webhookUrl?: string;
  /** GitHub repository URL */
  repositoryUrl?: string;
  /** Branch to work on (default: main) */
  branch?: string;
}

interface CursorAgent {
  id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  task: string;
  repository_url: string;
  branch: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  output?: {
    pull_request_url?: string;
    branch_name?: string;
    files_modified?: string[];
    files_created?: string[];
    files_deleted?: string[];
    summary?: string;
    error?: string;
  };
}

interface CreateAgentRequest {
  prompt: {
    text: string;
    images?: Array<{
      data: string;
      dimension: {
        width: number;
        height: number;
      };
    }>;
  };
  source: {
    repository: string;
    ref?: string;
    prUrl?: string;
  };
  target?: {
    autoCreatePr?: boolean;
    openAsCursorGithubApp?: boolean;
    skipReviewerRequest?: boolean;
    branchName?: string;
    autoBranch?: boolean;
  };
  model?: string;
  webhook?: {
    url: string;
    secret?: string;
  };
}

interface CreateAgentResponse {
  agent: CursorAgent;
}

/**
 * Cursor Cloud Agent API adapter
 */
export class CursorCloudAdapter extends BaseAgentAdapter {
  readonly name = "cursor-cloud";

  private readonly cursorConfig: CursorCloudConfig;
  private readonly baseUrl: string;

  constructor(policyConfig: PolicyConfig, cursorConfig: CursorCloudConfig) {
    super(policyConfig);
    this.cursorConfig = cursorConfig;
    this.baseUrl = cursorConfig.baseUrl || "https://api.cursor.com";
  }

  async validate(): Promise<boolean> {
    try {
      // Test API connectivity and authentication
      const response = await this.makeAuthenticatedRequest<{ status: string }>(
        "GET",
        `${this.baseUrl}/v0/agents`,
        {
          headers: this.getAuthHeaders(),
          timeout: 10000,
        }
      );

      logger.info({ response }, "Cursor API validation successful");
      return true;
    } catch (error) {
      logger.error({ error }, "Cursor API validation failed");
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

      // Create Cursor agent using official API format
      const agentRequest: CreateAgentRequest = {
        prompt: {
          text: this.buildTask(input),
        },
        source: {
          repository: this.cursorConfig.repositoryUrl || this.inferRepositoryUrl(input.repoPath),
          ref: this.cursorConfig.branch || "main",
        },
        target: {
          autoCreatePr: true,
          autoBranch: true,
        },
        ...(this.cursorConfig.webhookUrl && {
          webhook: {
            url: this.cursorConfig.webhookUrl,
          },
        }),
      };

      const createResponse = await this.makeAuthenticatedRequest<CreateAgentResponse>(
        "POST",
        `${this.baseUrl}/v0/agents`,
        {
          body: agentRequest,
          headers: this.getAuthHeaders(),
          timeout: 30000,
        }
      );

      const agentId = createResponse.agent.id;
      logger.info({ agentId, planId: input.planId, stepId: input.stepId }, "Cursor agent created");

      // Poll for completion
      const completedAgent = await this.pollForCompletion<CursorAgent>(
        `${this.baseUrl}/v0/agents/${agentId}`,
        {
          headers: this.getAuthHeaders(),
          maxAttempts: 240, // 20 minutes with 5s intervals
          initialDelay: 5000,
          maxDelay: 30000,
          isComplete: (agent) => ["completed", "failed", "cancelled"].includes(agent.status),
          timeout: this.cursorConfig.timeout ? this.cursorConfig.timeout * 1000 : 1200000, // 20 minutes default
        }
      );

      const success = completedAgent.status === "completed";
      const executionTime = Date.now() - startTime;

      const result: AgentResult = {
        success,
        modifiedFiles: completedAgent.output?.files_modified || [],
        createdFiles: completedAgent.output?.files_created || [],
        deletedFiles: completedAgent.output?.files_deleted || [],
        output: this.formatOutput(completedAgent),
        error: success ? undefined : completedAgent.output?.error,
        exitCode: success ? 0 : 1,
        executionTime,
      };

      logger.info(
        {
          agentId,
          planId: input.planId,
          stepId: input.stepId,
          success,
          executionTime,
          pullRequestUrl: completedAgent.output?.pull_request_url,
          modifiedFiles: result.modifiedFiles.length,
          createdFiles: result.createdFiles.length,
        },
        "Cursor agent completed"
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
        "Cursor agent failed"
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

  /**
   * Add follow-up instruction to a running agent
   */
  async addInstruction(agentId: string, instruction: string): Promise<void> {
    try {
      await this.makeAuthenticatedRequest(
        "POST",
        `${this.baseUrl}/v0/agents/${agentId}/instructions`,
        {
          body: { instruction },
          headers: this.getAuthHeaders(),
          timeout: 10000,
        }
      );

      logger.info({ agentId, instruction }, "Added instruction to Cursor agent");
    } catch (error) {
      logger.error({ error, agentId, instruction }, "Failed to add instruction");
      throw new AgentExecutionError(
        `Failed to add instruction: ${error instanceof Error ? error.message : String(error)}`,
        this.name
      );
    }
  }

  getConfig(): Record<string, unknown> {
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
  private getAuthHeaders(): Record<string, string> {
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
  private buildTask(input: AgentInput): string {
    const targetFiles = input.files.length > 0 
      ? `\n\n## Target Files\n${input.files.map((f) => `- ${this.getRelativePath(f, input.repoPath)}`).join("\n")}`
      : "";

    const chunkInfo = input.chunk ? `\n**Chunk**: ${input.chunk}` : "";

    return `# Code Migration Task: ${input.planId}

**Step**: ${input.stepId}${chunkInfo}
**Plan ID**: ${input.planId}
**Step ID**: ${input.stepId}${targetFiles}

## Instructions
${input.prompt}

## Guidelines
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
  private inferRepositoryUrl(repoPath: string): string {
    // This is a simplified version - in practice, you'd parse .git/config
    // or use git commands to get the remote URL
    const repoName = repoPath.split("/").pop() || "unknown";
    return `https://github.com/example/${repoName}`;
  }

  /**
   * Format output from completed agent
   */
  private formatOutput(agent: CursorAgent): string {
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
