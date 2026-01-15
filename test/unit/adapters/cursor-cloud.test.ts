import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  CursorCloudAdapter,
  type CursorCloudConfig,
} from "../../../src/adapters/agents/cursor-cloud.js";
import type { PolicyConfig, AgentInput } from "../../../src/adapters/types.js";

describe("CursorCloudAdapter", () => {
  let adapter: CursorCloudAdapter;
  let mockHttpClient: any;
  let policyConfig: PolicyConfig;
  let cursorConfig: CursorCloudConfig;
  let mockInput: AgentInput;

  beforeEach(() => {
    mockHttpClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };

    policyConfig = {
      allowedPaths: ["src/**"],
      blockedPaths: [".git/**"],
      maxFileSize: 1024 * 1024,
      dangerousPatterns: ["rm -rf"],
      networkIsolation: "none",
    };

    cursorConfig = {
      apiKey: "test-cursor-key",
      baseUrl: "https://api.cursor.com",
      repositoryUrl: "https://github.com/test/repo",
      timeout: 1200,
    };

    adapter = new CursorCloudAdapter(policyConfig, cursorConfig);
    (adapter as any).httpClient = mockHttpClient;

    mockInput = {
      planId: "cursor-plan",
      stepId: "cursor-step",
      repoPath: "/test/cursor-repo",
      files: ["src/component.tsx"],
      prompt: "Convert class component to hooks",
      timeout: 600,
    };
  });

  describe("constructor", () => {
    it("should set default configuration values", () => {
      const config = adapter.getConfig();
      expect(config.name).toBe("cursor-cloud");
      expect(config.baseUrl).toBe("https://api.cursor.com");
      expect(config.hasApiKey).toBe(true);
      expect(config.repositoryUrl).toBe("https://github.com/test/repo");
    });

    it("should use custom configuration", () => {
      const customAdapter = new CursorCloudAdapter(policyConfig, {
        ...cursorConfig,
        branch: "feature-branch",
        webhookUrl: "https://webhook.example.com",
      });
      const config = customAdapter.getConfig();
      expect(config.branch).toBe("feature-branch");
      expect(config.hasWebhook).toBe(true);
    });

    it("should handle custom timeout configuration", () => {
      const customAdapter = new CursorCloudAdapter(policyConfig, {
        ...cursorConfig,
        timeout: 900, // 15 minutes
      });
      const config = customAdapter.getConfig();
      expect(config.name).toBe("cursor-cloud");
      // The timeout is used internally during execution
    });

    it("should handle undefined timeout configuration", () => {
      const customAdapter = new CursorCloudAdapter(policyConfig, {
        apiKey: cursorConfig.apiKey,
        baseUrl: cursorConfig.baseUrl,
        repositoryUrl: cursorConfig.repositoryUrl,
        // timeout not specified - should use default
      });
      const config = customAdapter.getConfig();
      expect(config.name).toBe("cursor-cloud");
      // Should use default timeout when not specified
    });
  });

  describe("validate", () => {
    it("should return true for successful API check", async () => {
      mockHttpClient.get.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ agents: [] }),
        headers: { get: () => "application/json" },
      });

      const result = await adapter.validate();
      expect(result).toBe(true);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "https://api.cursor.com/v0/agents",
        expect.any(Object)
      );
    });

    it("should return false for API failure", async () => {
      mockHttpClient.get.mockRejectedValue(new Error("Network error"));

      const result = await adapter.validate();
      expect(result).toBe(false);
    });
  });

  describe("execute", () => {
    it("should successfully execute migration with PR creation", async () => {
      const agentId = "agent-789";
      const createResponse = {
        agent: {
          id: agentId,
          status: "pending",
          task: "Convert class component to hooks",
          repository_url: "https://github.com/test/repo",
          branch: "main",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      };

      const completedResponse = {
        id: agentId,
        status: "completed",
        task: "Convert class component to hooks",
        repository_url: "https://github.com/test/repo",
        branch: "main",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:02:00Z",
        completed_at: "2024-01-01T00:02:00Z",
        output: {
          pull_request_url: "https://github.com/test/repo/pull/123",
          branch_name: "hachiko/cursor-step-migration",
          files_modified: ["src/component.tsx"],
          files_created: ["src/component.test.tsx"],
          files_deleted: [],
          summary: "Successfully converted class component to hooks",
        },
      };

      mockHttpClient.post.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createResponse),
        headers: { get: () => "application/json" },
      });

      mockHttpClient.get.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(completedResponse),
        headers: { get: () => "application/json" },
      });

      const result = await adapter.execute(mockInput);

      expect(result.success).toBe(true);
      expect(result.modifiedFiles).toEqual(["src/component.tsx"]);
      expect(result.createdFiles).toEqual(["src/component.test.tsx"]);
      expect(result.deletedFiles).toEqual([]);
      expect(result.output).toContain("https://github.com/test/repo/pull/123");
      expect(result.exitCode).toBe(0);

      // Verify agent creation call
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        "https://api.cursor.com/v0/agents",
        expect.objectContaining({
          task: expect.stringContaining("Convert class component to hooks"),
          repository_url: "https://github.com/test/repo",
          branch: "main",
          files: ["src/component.tsx"],
          metadata: {
            plan_id: "cursor-plan",
            step_id: "cursor-step",
          },
        }),
        expect.any(Object)
      );
    });

    it("should handle cancelled agent", async () => {
      const agentId = "agent-cancelled";
      const createResponse = {
        agent: {
          id: agentId,
          status: "running",
          task: "test task",
          repository_url: "https://github.com/test/repo",
          branch: "main",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      };

      const cancelledResponse = {
        id: agentId,
        status: "cancelled",
        task: "test task",
        repository_url: "https://github.com/test/repo",
        branch: "main",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:01:00Z",
        output: {
          error: "Agent was cancelled by user",
        },
      };

      mockHttpClient.post.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createResponse),
        headers: { get: () => "application/json" },
      });

      mockHttpClient.get.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(cancelledResponse),
        headers: { get: () => "application/json" },
      });

      const result = await adapter.execute(mockInput);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Agent was cancelled by user");
      expect(result.exitCode).toBe(1);
    });

    it("should handle authentication errors", async () => {
      mockHttpClient.post.mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve("Invalid API key"),
      });

      const result = await adapter.execute(mockInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain("HTTP request failed");
      expect(result.exitCode).toBe(-1);
    });

    it("should enforce policy restrictions", async () => {
      const blockedInput = {
        ...mockInput,
        files: [".git/hooks/pre-commit"],
      };

      const result = await adapter.execute(blockedInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Policy violations");
      expect(mockHttpClient.post).not.toHaveBeenCalled();
    });
  });

  describe("addInstruction", () => {
    it("should add follow-up instruction to running agent", async () => {
      const agentId = "agent-123";
      const instruction = "Please also add error handling";

      mockHttpClient.post.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
        headers: { get: () => "application/json" },
      });

      await adapter.addInstruction(agentId, instruction);

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        `https://api.cursor.com/v0/agents/${agentId}/instructions`,
        { instruction: "Please also add error handling" },
        expect.any(Object)
      );
    });

    it("should handle instruction addition errors", async () => {
      mockHttpClient.post.mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve("Agent not found"),
      });

      await expect(adapter.addInstruction("nonexistent", "test instruction")).rejects.toThrow(
        "Failed to add instruction"
      );
    });

    it("should use custom timeout during polling", async () => {
      const customAdapter = new CursorCloudAdapter(policyConfig, {
        ...cursorConfig,
        timeout: 300, // 5 minutes custom timeout
      });
      (customAdapter as any).httpClient = mockHttpClient;

      const agentId = "agent-timeout-test";
      const createResponse = {
        agent: {
          id: agentId,
          status: "queued",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      };

      const completedResponse = {
        id: agentId,
        status: "completed",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:01:00Z",
        output: {
          files_modified: ["src/test.ts"],
          files_created: [],
          files_deleted: [],
          summary: "Custom timeout migration completed",
        },
      };

      mockHttpClient.post.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createResponse),
        headers: { get: () => "application/json" },
      });

      mockHttpClient.get.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(completedResponse),
        headers: { get: () => "application/json" },
      });

      const result = await customAdapter.execute(mockInput);

      expect(result.success).toBe(true);
      expect(result.output).toBe("Summary: Custom timeout migration completed");
    });
  });

  describe("task building", () => {
    it("should build comprehensive task description", () => {
      const taskMethod = (adapter as any).buildTask.bind(adapter);
      const task = taskMethod(mockInput);

      expect(task).toContain("# Code Migration Task: cursor-plan");
      expect(task).toContain("cursor-step");
      expect(task).toContain("src/component.tsx");
      expect(task).toContain("Convert class component to hooks");
      expect(task).toContain("Create a focused pull request");
    });

    it("should handle chunk information", () => {
      const taskMethod = (adapter as any).buildTask.bind(adapter);
      const inputWithChunk = { ...mockInput, chunk: "components-1" };
      const task = taskMethod(inputWithChunk);

      expect(task).toContain("components-1");
    });
  });

  describe("output formatting", () => {
    it("should format agent output with PR information", () => {
      const formatMethod = (adapter as any).formatOutput.bind(adapter);
      const agent = {
        output: {
          summary: "Migration completed",
          pull_request_url: "https://github.com/test/repo/pull/456",
          branch_name: "feature/migration",
        },
      };

      const output = formatMethod(agent);

      expect(output).toContain("Migration completed");
      expect(output).toContain("https://github.com/test/repo/pull/456");
      expect(output).toContain("feature/migration");
    });

    it("should handle minimal output", () => {
      const formatMethod = (adapter as any).formatOutput.bind(adapter);
      const agent = { output: {} };

      const output = formatMethod(agent);
      expect(output).toBe("Agent completed successfully");
    });
  });

  describe("authentication", () => {
    it("should use Basic Auth with base64 encoding", () => {
      const authMethod = (adapter as any).getAuthHeaders.bind(adapter);
      const headers = authMethod();

      expect(headers.Authorization).toContain("Basic ");
      // Base64 encoding of "test-cursor-key:"
      const expectedAuth = Buffer.from("test-cursor-key:").toString("base64");
      expect(headers.Authorization).toBe(`Basic ${expectedAuth}`);
      expect(headers["User-Agent"]).toBe("Hachiko/1.0");
    });
  });

  describe("repository URL inference", () => {
    it("should infer repository URL from repo path", () => {
      const inferMethod = (adapter as any).inferRepositoryUrl.bind(adapter);

      expect(inferMethod("/path/to/my-project")).toBe("https://github.com/example/my-project");
      expect(inferMethod("/nested/path/to/another-repo")).toBe(
        "https://github.com/example/another-repo"
      );
      expect(inferMethod("/")).toBe("https://github.com/example/unknown");
    });
  });
});
