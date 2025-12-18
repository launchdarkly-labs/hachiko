import { AgentExecutionError } from "../../utils/errors.js";
import { createLogger } from "../../utils/logger.js";
import type { AgentInput, AgentResult, PolicyConfig } from "../types.js";
import { BaseAgentAdapter } from "./base.js";

const logger = createLogger("codex-cloud-adapter");

export interface CodexCloudConfig {
  /** OpenAI API key */
  apiKey: string;
  /** API base URL (default: https://api.openai.com) */
  baseUrl?: string;
  /** Model to use (default: gpt-4-turbo) */
  model?: string;
  /** Request timeout in seconds */
  timeout?: number;
  /** Max tokens for response */
  maxTokens?: number;
  /** Temperature for creativity (0-2) */
  temperature?: number;
  /** GitHub repository URL for context */
  repositoryUrl?: string;
}

interface CodexChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface CodexChatRequest {
  model: string;
  messages: CodexChatMessage[];
  max_tokens?: number;
  temperature?: number;
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } };
}

interface CodexChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface FileOperation {
  type: "create" | "modify" | "delete";
  path: string;
  content?: string;
  reason: string;
}

/**
 * OpenAI Codex Cloud API adapter
 */
export class CodexCloudAdapter extends BaseAgentAdapter {
  readonly name = "codex-cloud";

  private readonly codexConfig: CodexCloudConfig;
  private readonly baseUrl: string;

  constructor(policyConfig: PolicyConfig, codexConfig: CodexCloudConfig) {
    super(policyConfig);
    this.codexConfig = codexConfig;
    this.baseUrl = codexConfig.baseUrl || "https://api.openai.com";
  }

  async validate(): Promise<boolean> {
    try {
      // Test API connectivity and authentication
      const response = await this.makeAuthenticatedRequest<{ data: unknown[] }>(
        "GET",
        `${this.baseUrl}/v1/models`,
        {
          headers: this.getAuthHeaders(),
          timeout: 10000,
        }
      );

      logger.info({ modelCount: response.data.length }, "Codex API validation successful");
      return true;
    } catch (error) {
      logger.error({ error }, "Codex API validation failed");
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

      // Read current file contents
      const fileContents = await this.readFileContents(input.files, input.repoPath);

      // Create chat request with function calling
      const chatRequest: CodexChatRequest = {
        model: this.codexConfig.model || "gpt-4-turbo",
        messages: [
          {
            role: "system",
            content: this.buildSystemPrompt(),
          },
          {
            role: "user",
            content: this.buildUserPrompt(input, fileContents),
          },
        ],
        max_tokens: this.codexConfig.maxTokens || 4000,
        temperature: this.codexConfig.temperature || 0.1,
        tools: this.buildTools(),
        tool_choice: "auto",
      };

      const response = await this.makeAuthenticatedRequest<CodexChatResponse>(
        "POST",
        `${this.baseUrl}/v1/chat/completions`,
        {
          body: chatRequest,
          headers: this.getAuthHeaders(),
          timeout: this.codexConfig.timeout ? this.codexConfig.timeout * 1000 : 120000,
        }
      );

      // Process the response and extract file operations
      const fileOperations = this.extractFileOperations(response);
      const success =
        response.choices[0]?.finish_reason === "stop" ||
        response.choices[0]?.finish_reason === "tool_calls";

      // Apply file operations
      let modifiedFiles: string[] = [];
      let createdFiles: string[] = [];
      let deletedFiles: string[] = [];

      if (success) {
        const applyResult = await this.applyFileOperations(fileOperations, input.repoPath);
        modifiedFiles = applyResult.modified;
        createdFiles = applyResult.created;
        deletedFiles = applyResult.deleted;
      }

      const executionTime = Date.now() - startTime;

      const result: AgentResult = {
        success,
        modifiedFiles,
        createdFiles,
        deletedFiles,
        output: this.formatOutput(response, fileOperations),
        error: success ? undefined : "Codex execution incomplete or failed",
        exitCode: success ? 0 : 1,
        executionTime,
      };

      logger.info(
        {
          planId: input.planId,
          stepId: input.stepId,
          success,
          executionTime,
          tokensUsed: response.usage.total_tokens,
          modifiedFiles: result.modifiedFiles.length,
          createdFiles: result.createdFiles.length,
        },
        "Codex execution completed"
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
        "Codex execution failed"
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
      model: this.codexConfig.model,
      timeout: this.codexConfig.timeout,
      maxTokens: this.codexConfig.maxTokens,
      temperature: this.codexConfig.temperature,
      repositoryUrl: this.codexConfig.repositoryUrl,
      hasApiKey: !!this.codexConfig.apiKey,
    };
  }

  /**
   * Get authentication headers for OpenAI API
   */
  private getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.codexConfig.apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "Hachiko/1.0",
    };
  }

  /**
   * Build system prompt for Codex
   */
  private buildSystemPrompt(): string {
    return `You are Codex, an expert software engineer specialized in code migrations and refactoring.

Your role:
- Analyze existing code and apply systematic migrations
- Preserve functionality while implementing requested changes  
- Follow existing code patterns and styles
- Make safe, incremental modifications
- Use the provided tools to create, modify, or delete files

Guidelines:
- Only modify files that are explicitly listed in the user's request
- Maintain backward compatibility when possible
- Add clear comments explaining significant changes
- Ensure all changes are atomic and cohesive
- Follow the project's existing conventions

You have access to file operation tools. Use them to implement the requested changes systematically.`;
  }

  /**
   * Build user prompt with context
   */
  private buildUserPrompt(input: AgentInput, fileContents: Map<string, string>): string {
    const fileList = Array.from(fileContents.entries())
      .map(([path, content]) => `## ${path}\n\`\`\`\n${content}\n\`\`\``)
      .join("\n\n");

    return `# Migration Task

**Plan**: ${input.planId}
**Step**: ${input.stepId}
${input.chunk ? `**Chunk**: ${input.chunk}` : ""}

## Instructions
${input.prompt}

## Current Files
${fileList}

## Target Files
${input.files.map((f) => `- ${this.getRelativePath(f, input.repoPath)}`).join("\n")}

Please analyze the current files and implement the requested changes using the file operation tools. Make sure to:
1. Only modify the specified target files
2. Preserve existing functionality
3. Follow the code's existing patterns
4. Add appropriate comments for significant changes
5. Ensure all modifications are safe and atomic

Use the file operation tools to implement the changes.`;
  }

  /**
   * Build function tools for file operations
   */
  private buildTools() {
    return [
      {
        type: "function" as const,
        function: {
          name: "modify_file",
          description: "Modify an existing file with new content",
          parameters: {
            type: "object",
            properties: {
              path: { type: "string", description: "Relative path to the file" },
              content: { type: "string", description: "New file content" },
              reason: { type: "string", description: "Explanation of why this change is needed" },
            },
            required: ["path", "content", "reason"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "create_file",
          description: "Create a new file",
          parameters: {
            type: "object",
            properties: {
              path: { type: "string", description: "Relative path for the new file" },
              content: { type: "string", description: "Content for the new file" },
              reason: { type: "string", description: "Explanation of why this file is needed" },
            },
            required: ["path", "content", "reason"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "delete_file",
          description: "Delete an existing file",
          parameters: {
            type: "object",
            properties: {
              path: { type: "string", description: "Relative path to the file to delete" },
              reason: {
                type: "string",
                description: "Explanation of why this file should be deleted",
              },
            },
            required: ["path", "reason"],
          },
        },
      },
    ];
  }

  /**
   * Read contents of specified files
   */
  private async readFileContents(files: string[], repoPath: string): Promise<Map<string, string>> {
    const contents = new Map<string, string>();
    const fs = await import("node:fs/promises");

    for (const file of files) {
      try {
        const content = await fs.readFile(file, "utf-8");
        const relativePath = this.getRelativePath(file, repoPath);
        contents.set(relativePath, content);
      } catch (error) {
        logger.warn({ file, error }, "Failed to read file, may be created during migration");
        const relativePath = this.getRelativePath(file, repoPath);
        contents.set(relativePath, "// File will be created during migration");
      }
    }

    return contents;
  }

  /**
   * Extract file operations from Codex response
   */
  private extractFileOperations(response: CodexChatResponse): FileOperation[] {
    const operations: FileOperation[] = [];
    const choice = response.choices[0];

    if (choice?.message.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.type === "function") {
          try {
            const args = JSON.parse(toolCall.function.arguments);

            switch (toolCall.function.name) {
              case "modify_file":
                operations.push({
                  type: "modify",
                  path: args.path,
                  content: args.content,
                  reason: args.reason,
                });
                break;
              case "create_file":
                operations.push({
                  type: "create",
                  path: args.path,
                  content: args.content,
                  reason: args.reason,
                });
                break;
              case "delete_file":
                operations.push({
                  type: "delete",
                  path: args.path,
                  reason: args.reason,
                });
                break;
            }
          } catch (error) {
            logger.warn({ toolCall, error }, "Failed to parse tool call arguments");
          }
        }
      }
    }

    return operations;
  }

  /**
   * Apply file operations to the repository
   */
  private async applyFileOperations(
    operations: FileOperation[],
    repoPath: string
  ): Promise<{ modified: string[]; created: string[]; deleted: string[] }> {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    const modified: string[] = [];
    const created: string[] = [];
    const deleted: string[] = [];

    for (const operation of operations) {
      const fullPath = path.resolve(repoPath, operation.path);

      try {
        switch (operation.type) {
          case "modify":
            if (operation.content !== undefined) {
              await fs.writeFile(fullPath, operation.content, "utf-8");
              modified.push(operation.path);
              logger.debug({ path: operation.path, reason: operation.reason }, "File modified");
            }
            break;
          case "create":
            if (operation.content !== undefined) {
              // Ensure directory exists
              await fs.mkdir(path.dirname(fullPath), { recursive: true });
              await fs.writeFile(fullPath, operation.content, "utf-8");
              created.push(operation.path);
              logger.debug({ path: operation.path, reason: operation.reason }, "File created");
            }
            break;
          case "delete":
            await fs.unlink(fullPath);
            deleted.push(operation.path);
            logger.debug({ path: operation.path, reason: operation.reason }, "File deleted");
            break;
        }
      } catch (error) {
        logger.error({ operation, error }, "Failed to apply file operation");
      }
    }

    return { modified, created, deleted };
  }

  /**
   * Format output from Codex response
   */
  private formatOutput(response: CodexChatResponse, operations: FileOperation[]): string {
    const parts = [];

    const choice = response.choices[0];
    if (choice?.message.content) {
      parts.push(`Response: ${choice.message.content}`);
    }

    if (operations.length > 0) {
      parts.push(`\nFile Operations:`);
      for (const op of operations) {
        parts.push(`- ${op.type.toUpperCase()}: ${op.path} (${op.reason})`);
      }
    }

    parts.push(`\nTokens used: ${response.usage.total_tokens}`);

    return parts.join("\n");
  }
}
