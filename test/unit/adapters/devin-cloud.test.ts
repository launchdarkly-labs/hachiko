import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DevinCloudAdapter,
  type DevinCloudConfig,
} from "../../../src/adapters/agents/devin-cloud.js";
import type { PolicyConfig, AgentInput } from "../../../src/adapters/types.js";

describe("DevinCloudAdapter", () => {
  let adapter: DevinCloudAdapter;
  let mockHttpClient: any;
  let policyConfig: PolicyConfig;
  let devinConfig: DevinCloudConfig;
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

    devinConfig = {
      apiKey: "test-api-key",
      baseUrl: "https://api.devin.ai",
      timeout: 600,
    };

    adapter = new DevinCloudAdapter(policyConfig, devinConfig);
    // Replace the HTTP client with our mock
    (adapter as any).httpClient = mockHttpClient;

    mockInput = {
      planId: "test-plan",
      stepId: "test-step",
      repoPath: "/test/repo",
      files: ["src/test.ts"],
      prompt: "Test migration prompt",
      timeout: 300,
    };
  });

  describe("constructor", () => {
    it("should set default configuration values", () => {
      const config = adapter.getConfig();
      expect(config.name).toBe("devin-cloud");
      expect(config.baseUrl).toBe("https://api.devin.ai");
      expect(config.hasApiKey).toBe(true);
    });

    it("should use custom base URL if provided", () => {
      const customAdapter = new DevinCloudAdapter(policyConfig, {
        ...devinConfig,
        baseUrl: "https://custom.devin.ai",
      });
      const config = customAdapter.getConfig();
      expect(config.baseUrl).toBe("https://custom.devin.ai");
    });
  });

  describe("validate", () => {
    it("should return true for successful health check", async () => {
      mockHttpClient.get.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: "healthy" }),
        headers: { get: () => "application/json" },
      });

      const result = await adapter.validate();
      expect(result).toBe(true);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "https://api.devin.ai/v1/health",
        expect.any(Object)
      );
    });

    it("should return false for failed health check", async () => {
      mockHttpClient.get.mockRejectedValue(new Error("Connection failed"));

      const result = await adapter.validate();
      expect(result).toBe(false);
    });
  });

  describe("execute", () => {
    it("should successfully execute a migration", async () => {
      const sessionId = "session-123";
      const createResponse = {
        session: {
          id: sessionId,
          status: "pending",
          prompt: "test prompt",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      };

      const completedResponse = {
        id: sessionId,
        status: "completed",
        prompt: "test prompt",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:01:00Z",
        output: {
          files_modified: ["src/test.ts"],
          files_created: [],
          files_deleted: [],
          summary: "Migration completed successfully",
        },
      };

      // Mock session creation
      mockHttpClient.post.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createResponse),
        headers: { get: () => "application/json" },
      });

      // Mock session status polling (completed immediately)
      mockHttpClient.get.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(completedResponse),
        headers: { get: () => "application/json" },
      });

      const result = await adapter.execute(mockInput);

      expect(result.success).toBe(true);
      expect(result.modifiedFiles).toEqual(["src/test.ts"]);
      expect(result.createdFiles).toEqual([]);
      expect(result.deletedFiles).toEqual([]);
      expect(result.output).toBe("Migration completed successfully");
      expect(result.exitCode).toBe(0);

      // Verify API calls
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        "https://api.devin.ai/v1/sessions",
        expect.objectContaining({
          prompt: expect.stringContaining("Test migration prompt"),
          files: ["src/test.ts"],
          repository_path: "/test/repo",
          metadata: {
            plan_id: "test-plan",
            step_id: "test-step",
          },
        }),
        expect.any(Object)
      );

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        `https://api.devin.ai/v1/sessions/${sessionId}`,
        expect.any(Object)
      );
    });

    it("should handle failed migration", async () => {
      const sessionId = "session-456";
      const createResponse = {
        session: {
          id: sessionId,
          status: "pending",
          prompt: "test prompt",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      };

      const failedResponse = {
        id: sessionId,
        status: "failed",
        prompt: "test prompt",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:01:00Z",
        output: {
          error: "Migration failed due to syntax error",
        },
      };

      mockHttpClient.post.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createResponse),
        headers: { get: () => "application/json" },
      });

      mockHttpClient.get.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(failedResponse),
        headers: { get: () => "application/json" },
      });

      const result = await adapter.execute(mockInput);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Migration failed due to syntax error");
      expect(result.exitCode).toBe(1);
    });

    it("should handle policy violations", async () => {
      const violatingInput = {
        ...mockInput,
        files: [".git/config"], // Blocked by policy
      };

      const result = await adapter.execute(violatingInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Policy violations");
      expect(mockHttpClient.post).not.toHaveBeenCalled();
    });

    it("should handle API errors", async () => {
      mockHttpClient.post.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      });

      const result = await adapter.execute(mockInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain("HTTP request failed");
      expect(result.exitCode).toBe(-1);
    });

    it("should include chunk in metadata when provided", async () => {
      const inputWithChunk = {
        ...mockInput,
        chunk: "chunk-1",
      };

      const createResponse = {
        session: {
          id: "session-123",
          status: "completed",
          prompt: "test prompt",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
          output: { summary: "Done" },
        },
      };

      mockHttpClient.post.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createResponse),
        headers: { get: () => "application/json" },
      });

      mockHttpClient.get.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createResponse.session),
        headers: { get: () => "application/json" },
      });

      await adapter.execute(inputWithChunk);

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          metadata: expect.objectContaining({
            chunk: "chunk-1",
          }),
        }),
        expect.any(Object)
      );
    });
  });

  describe("prompt building", () => {
    it("should build comprehensive prompt with all context", () => {
      const promptMethod = (adapter as any).buildPrompt.bind(adapter);
      const prompt = promptMethod(mockInput);

      expect(prompt).toContain("# Code Migration Task");
      expect(prompt).toContain("test-plan");
      expect(prompt).toContain("test-step");
      expect(prompt).toContain("src/test.ts");
      expect(prompt).toContain("Test migration prompt");
      expect(prompt).toContain("/test/repo");
    });

    it("should include chunk information when present", () => {
      const promptMethod = (adapter as any).buildPrompt.bind(adapter);
      const inputWithChunk = { ...mockInput, chunk: "chunk-2" };
      const prompt = promptMethod(inputWithChunk);

      expect(prompt).toContain("chunk-2");
    });
  });
});
