import { describe, it, expect, beforeEach, vi } from "vitest";
import { CodexCloudAdapter, type CodexCloudConfig } from "../../../src/adapters/agents/codex-cloud.js";
import type { PolicyConfig, AgentInput } from "../../../src/adapters/types.js";

// Mock fs/promises module
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock("node:path", () => ({
  resolve: vi.fn((base, rel) => `${base}/${rel}`),
  dirname: vi.fn((path) => path.split("/").slice(0, -1).join("/")),
}));

describe("CodexCloudAdapter", () => {
  let adapter: CodexCloudAdapter;
  let mockHttpClient: any;
  let mockFs: any;
  let policyConfig: PolicyConfig;
  let codexConfig: CodexCloudConfig;
  let mockInput: AgentInput;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    mockHttpClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };

    // Get the mocked fs module
    mockFs = await import("node:fs/promises");

    policyConfig = {
      allowedPaths: ["src/**"],
      blockedPaths: [".git/**", "node_modules/**"],
      maxFileSize: 1024 * 1024,
      dangerousPatterns: ["rm -rf", "sudo"],
      networkIsolation: "none",
    };

    codexConfig = {
      apiKey: "test-openai-key",
      baseUrl: "https://api.openai.com",
      model: "gpt-4-turbo",
      maxTokens: 4000,
      temperature: 0.1,
    };

    adapter = new CodexCloudAdapter(policyConfig, codexConfig);
    (adapter as any).httpClient = mockHttpClient;

    mockInput = {
      planId: "codex-plan",
      stepId: "codex-step",
      repoPath: "/test/codex-repo",
      files: ["src/utils.ts", "src/types.ts"],
      prompt: "Add TypeScript strict mode support",
      timeout: 120,
    };
  });

  describe("constructor", () => {
    it("should set default configuration values", () => {
      const config = adapter.getConfig();
      expect(config.name).toBe("codex-cloud");
      expect(config.baseUrl).toBe("https://api.openai.com");
      expect(config.model).toBe("gpt-4-turbo");
      expect(config.maxTokens).toBe(4000);
      expect(config.temperature).toBe(0.1);
      expect(config.hasApiKey).toBe(true);
    });

    it("should use custom configuration", () => {
      const customConfig = {
        ...codexConfig,
        model: "gpt-4",
        temperature: 0.2,
        repositoryUrl: "https://github.com/test/repo",
      };
      
      const customAdapter = new CodexCloudAdapter(policyConfig, customConfig);
      const config = customAdapter.getConfig();
      
      expect(config.model).toBe("gpt-4");
      expect(config.temperature).toBe(0.2);
      expect(config.repositoryUrl).toBe("https://github.com/test/repo");
    });
  });

  describe("validate", () => {
    it("should return true for successful models API check", async () => {
      mockHttpClient.get.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: "gpt-4" }, { id: "gpt-3.5-turbo" }] }),
        headers: { get: () => "application/json" },
      });

      const result = await adapter.validate();
      expect(result).toBe(true);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "https://api.openai.com/v1/models",
        expect.any(Object)
      );
    });

    it("should return false for API failure", async () => {
      mockHttpClient.get.mockRejectedValue(new Error("Invalid API key"));

      const result = await adapter.validate();
      expect(result).toBe(false);
    });
  });

  describe("execute", () => {
    beforeEach(() => {
      // Mock file reading
      mockFs.readFile.mockImplementation((path: string) => {
        if (path.includes("utils.ts")) {
          return Promise.resolve("export function oldUtilFunction() { return 'old'; }");
        }
        if (path.includes("types.ts")) {
          return Promise.resolve("interface OldType { name: string; }");
        }
        return Promise.resolve("");
      });

      // Mock file writing operations
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.unlink.mockResolvedValue(undefined);
    });

    it("should successfully execute migration with function calls", async () => {
      const chatResponse = {
        id: "chatcmpl-123",
        object: "chat.completion",
        created: 1234567890,
        model: "gpt-4-turbo",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "I'll help you add TypeScript strict mode support.",
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: {
                    name: "modify_file",
                    arguments: JSON.stringify({
                      path: "src/utils.ts",
                      content: "export function oldUtilFunction(): string { return 'old'; }",
                      reason: "Added strict type annotations",
                    }),
                  },
                },
                {
                  id: "call_2",
                  type: "function",
                  function: {
                    name: "modify_file",
                    arguments: JSON.stringify({
                      path: "src/types.ts",
                      content: "export interface OldType { readonly name: string; }",
                      reason: "Added readonly modifier for immutability",
                    }),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: {
          prompt_tokens: 150,
          completion_tokens: 85,
          total_tokens: 235,
        },
      };

      mockHttpClient.post.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(chatResponse),
        headers: { get: () => "application/json" },
      });

      const result = await adapter.execute(mockInput);

      expect(result.success).toBe(true);
      expect(result.modifiedFiles).toEqual(["src/utils.ts", "src/types.ts"]);
      expect(result.createdFiles).toEqual([]);
      expect(result.deletedFiles).toEqual([]);
      expect(result.output).toContain("Tokens used: 235");
      expect(result.output).toContain("MODIFY: src/utils.ts");
      expect(result.exitCode).toBe(0);

      // Verify file operations were called
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        "/test/codex-repo/src/utils.ts",
        "export function oldUtilFunction(): string { return 'old'; }",
        "utf-8"
      );
    });

    it("should handle file creation with function calls", async () => {
      const chatResponse = {
        id: "chatcmpl-456",
        object: "chat.completion",
        created: 1234567890,
        model: "gpt-4-turbo",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Creating new configuration file.",
              tool_calls: [
                {
                  id: "call_create",
                  type: "function",
                  function: {
                    name: "create_file",
                    arguments: JSON.stringify({
                      path: "src/config.ts",
                      content: "export const config = { strict: true };",
                      reason: "Added TypeScript configuration file",
                    }),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      mockHttpClient.post.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(chatResponse),
        headers: { get: () => "application/json" },
      });

      const result = await adapter.execute(mockInput);

      expect(result.success).toBe(true);
      expect(result.createdFiles).toEqual(["src/config.ts"]);
      expect(mockFs.mkdir).toHaveBeenCalled(); // Directory creation
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        "/test/codex-repo/src/config.ts",
        "export const config = { strict: true };",
        "utf-8"
      );
    });

    it("should handle file deletion", async () => {
      const chatResponse = {
        id: "chatcmpl-789",
        object: "chat.completion",
        created: 1234567890,
        model: "gpt-4-turbo",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Removing deprecated file.",
              tool_calls: [
                {
                  id: "call_delete",
                  type: "function",
                  function: {
                    name: "delete_file",
                    arguments: JSON.stringify({
                      path: "src/deprecated.ts",
                      reason: "File is no longer needed after migration",
                    }),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: {
          prompt_tokens: 80,
          completion_tokens: 30,
          total_tokens: 110,
        },
      };

      mockHttpClient.post.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(chatResponse),
        headers: { get: () => "application/json" },
      });

      const result = await adapter.execute(mockInput);

      expect(result.success).toBe(true);
      expect(result.deletedFiles).toEqual(["src/deprecated.ts"]);
      expect(mockFs.unlink).toHaveBeenCalledWith("/test/codex-repo/src/deprecated.ts");
    });

    it("should handle malformed tool call arguments", async () => {
      const chatResponse = {
        id: "chatcmpl-error",
        object: "chat.completion",
        created: 1234567890,
        model: "gpt-4-turbo",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Attempting modification.",
              tool_calls: [
                {
                  id: "call_bad",
                  type: "function",
                  function: {
                    name: "modify_file",
                    arguments: "{ invalid json",
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: { prompt_tokens: 50, completion_tokens: 25, total_tokens: 75 },
      };

      mockHttpClient.post.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(chatResponse),
        headers: { get: () => "application/json" },
      });

      const result = await adapter.execute(mockInput);

      expect(result.success).toBe(true); // Still successful, just ignores bad tool call
      expect(result.modifiedFiles).toEqual([]);
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });

    it("should handle API errors", async () => {
      mockHttpClient.post.mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve("Rate limit exceeded"),
      });

      const result = await adapter.execute(mockInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain("HTTP request failed");
      expect(result.exitCode).toBe(-1);
    });

    it("should handle policy violations", async () => {
      const violatingInput = {
        ...mockInput,
        files: ["node_modules/package/index.js"],
      };

      const result = await adapter.execute(violatingInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Policy violations");
      expect(mockHttpClient.post).not.toHaveBeenCalled();
    });

    it("should handle file read errors gracefully", async () => {
      mockFs.readFile.mockRejectedValue(new Error("File not found"));

      const chatResponse = {
        id: "chatcmpl-123",
        object: "chat.completion",
        created: 1234567890,
        model: "gpt-4-turbo",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Files processed successfully.",
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 50, completion_tokens: 25, total_tokens: 75 },
      };

      mockHttpClient.post.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(chatResponse),
        headers: { get: () => "application/json" },
      });

      const result = await adapter.execute(mockInput);

      expect(result.success).toBe(true);
      // Should still make API call even if files can't be read
      expect(mockHttpClient.post).toHaveBeenCalled();
    });

    it("should handle file operation errors", async () => {
      // Mock writeFile to throw an error to trigger the error handling branch
      mockFs.writeFile.mockRejectedValue(new Error("Write permission denied"));
      
      const chatResponse = {
        id: "chatcmpl-123",
        object: "chat.completion",
        created: 1234567890,
        model: "gpt-4-turbo",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "I'll modify the file.",
              tool_calls: [
                {
                  id: "call_modify",
                  type: "function",
                  function: {
                    name: "modify_file",
                    arguments: JSON.stringify({
                      path: "src/utils.ts",
                      content: "// Modified content",
                      reason: "Update implementation",
                    }),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: { prompt_tokens: 50, completion_tokens: 25, total_tokens: 75 },
      };

      mockHttpClient.post.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(chatResponse),
        headers: { get: () => "application/json" },
      });

      const result = await adapter.execute(mockInput);

      // Should still be successful overall, just log the file operation error
      expect(result.success).toBe(true);
      expect(mockFs.writeFile).toHaveBeenCalled();
      // File operation should have failed, so no files should be reported as modified
      expect(result.modifiedFiles).toEqual([]);
    });
  });

  describe("prompt building", () => {
    beforeEach(() => {
      mockFs.readFile.mockImplementation((path: string) => {
        if (path.includes("utils.ts")) {
          return Promise.resolve("export function test() {}");
        }
        return Promise.resolve("// empty file");
      });
    });

    it("should build comprehensive system prompt", async () => {
      const systemPromptMethod = (adapter as any).buildSystemPrompt.bind(adapter);
      const prompt = systemPromptMethod();

      expect(prompt).toContain("You are Codex");
      expect(prompt).toContain("expert software engineer");
      expect(prompt).toContain("code migrations");
      expect(prompt).toContain("file operation tools");
    });

    it("should build user prompt with file contents", async () => {
      const userPromptMethod = (adapter as any).buildUserPrompt.bind(adapter);
      const fileContents = new Map([
        ["src/utils.ts", "export function test() {}"],
        ["src/types.ts", "interface Test {}"],
      ]);

      const prompt = userPromptMethod(mockInput, fileContents);

      expect(prompt).toContain("# Migration Task");
      expect(prompt).toContain("codex-plan");
      expect(prompt).toContain("codex-step");
      expect(prompt).toContain("Add TypeScript strict mode support");
      expect(prompt).toContain("export function test() {}");
      expect(prompt).toContain("interface Test {}");
    });
  });

  describe("tools configuration", () => {
    it("should provide file operation tools", () => {
      const toolsMethod = (adapter as any).buildTools.bind(adapter);
      const tools = toolsMethod();

      expect(tools).toHaveLength(3);
      expect(tools.map((t: any) => t.function.name)).toEqual([
        "modify_file",
        "create_file", 
        "delete_file",
      ]);

      const modifyTool = tools.find((t: any) => t.function.name === "modify_file");
      expect(modifyTool.function.parameters.required).toEqual([
        "path",
        "content",
        "reason",
      ]);
    });
  });

  describe("authentication", () => {
    it("should use Bearer token authentication", () => {
      const authMethod = (adapter as any).getAuthHeaders.bind(adapter);
      const headers = authMethod();

      expect(headers.Authorization).toBe("Bearer test-openai-key");
      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers["User-Agent"]).toBe("Hachiko/1.0");
    });
  });
});