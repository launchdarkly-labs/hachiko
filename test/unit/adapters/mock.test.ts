import { beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";

// Mock fs
vi.mock("node:fs", () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    stat: vi.fn(),
  },
}));

// Mock logger
vi.mock("../../../src/utils/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { MockAgentAdapter } from "../../../src/adapters/agents/mock.js";
import type { AgentInput, PolicyConfig } from "../../../src/adapters/types.js";

describe("MockAgentAdapter", () => {
  let adapter: MockAgentAdapter;
  let mockPolicyConfig: PolicyConfig;

  beforeEach(() => {
    mockPolicyConfig = {
      allowedPaths: ["src/**", "test/**"],
      blockedPaths: [".git/**"],
      dangerousPatterns: ["rm -rf", "sudo"],
      maxFileSize: 1024 * 1024, // 1MB
    };
    adapter = new MockAgentAdapter(mockPolicyConfig);
  });

  describe("basic functionality", () => {
    it("should have the correct name", () => {
      expect(adapter.name).toBe("mock");
    });

    it("should validate successfully", async () => {
      const result = await adapter.validate();
      expect(result).toBe(true);
    });

    it("should return configuration", () => {
      const config = adapter.getConfig();
      expect(config).toMatchObject({
        name: "mock",
        successRate: 0.9,
        executionTime: 2000,
        modifyFiles: false,
      });
    });
  });

  describe("execute", () => {
    it("should execute with random success rate", async () => {
      // Create adapter with guaranteed success for testing
      const successAdapter = new MockAgentAdapter(mockPolicyConfig, {
        successRate: 1.0,
        executionTime: 100,
      });

      const input: AgentInput = {
        planId: "test-plan",
        stepId: "step-1",
        repoPath: "/tmp/test-repo",
        files: ["src/test.ts"],
        prompt: "Test migration",
        context: {},
      };

      const result = await successAdapter.execute(input);

      expect(result.success).toBe(true);
      expect(result.output).toContain("Mock agent successfully processed 1 files");
      expect(result.modifiedFiles).toEqual([]); // No files modified when modifyFiles is false
      expect(result.createdFiles).toEqual([]);
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it("should simulate failure with low success rate", async () => {
      // Create adapter with guaranteed failure
      const failAdapter = new MockAgentAdapter(mockPolicyConfig, {
        successRate: 0.0,
        executionTime: 100,
      });

      const input: AgentInput = {
        planId: "test-plan",
        stepId: "fail-step",
        repoPath: "/tmp/test-repo",
        files: ["src/test.ts"],
        prompt: "This should fail",
        context: {},
      };

      const result = await failAdapter.execute(input);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Simulated failure");
      expect(result.exitCode).toBe(1);
    });

    it("should handle modifyFiles option", async () => {
      // Create adapter that simulates file modification without actually writing files
      const modifyAdapter = new MockAgentAdapter(mockPolicyConfig, {
        successRate: 1.0,
        executionTime: 100,
        modifyFiles: false, // Keep false to avoid filesystem operations in tests
      });

      const input: AgentInput = {
        planId: "test-plan",
        stepId: "modify-step",
        repoPath: "/tmp/test-repo",
        files: ["src/test-file.ts"],
        prompt: "Create new files",
        context: {},
      };

      const result = await modifyAdapter.execute(input);

      expect(result.success).toBe(true);
      // When modifyFiles is false, no files should be modified
      expect(result.createdFiles).toEqual([]);
      expect(result.modifiedFiles).toEqual([]);
      expect(result.output).toContain("Mock agent successfully processed 1 files");
    });
  });

  describe("policy enforcement", () => {
    it("should reject blocked file paths", async () => {
      const blockedInput: AgentInput = {
        planId: "test-plan",
        stepId: "blocked-step",
        repoPath: "/tmp/test-repo",
        files: [".git/config"], // This should be blocked
        prompt: "Try to access git config",
        context: {},
      };

      const result = await adapter.execute(blockedInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Policy violation");
    });
  });

  describe("file modification", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should modify existing files when modifyFiles is true", async () => {
      const modifyAdapter = new MockAgentAdapter(mockPolicyConfig, {
        successRate: 1.0,
        executionTime: 0,
        modifyFiles: true,
      });

      const existingContent = "// Existing file content\nconst x = 1;";
      vi.mocked(fs.readFile).mockResolvedValue(existingContent);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const input: AgentInput = {
        planId: "test-plan",
        stepId: "modify-step",
        repoPath: "/tmp/test-repo",
        files: ["/tmp/test-repo/src/existing.ts"],
        prompt: "Modify file",
      };

      const result = await modifyAdapter.execute(input);

      expect(result.success).toBe(true);
      expect(fs.readFile).toHaveBeenCalledWith("/tmp/test-repo/src/existing.ts", "utf-8");
      expect(fs.writeFile).toHaveBeenCalled();
      expect(result.modifiedFiles).toContain("src/existing.ts");
      expect(result.createdFiles).toEqual([]);
    });

    it("should create new files when file doesn't exist and modifyFiles is true", async () => {
      const createAdapter = new MockAgentAdapter(mockPolicyConfig, {
        successRate: 1.0,
        executionTime: 0,
        modifyFiles: true,
      });

      vi.mocked(fs.readFile).mockRejectedValue(new Error("File not found"));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const input: AgentInput = {
        planId: "test-plan",
        stepId: "create-step",
        repoPath: "/tmp/test-repo",
        files: ["/tmp/test-repo/src/new.ts"],
        prompt: "Create new file",
      };

      const result = await createAdapter.execute(input);

      expect(result.success).toBe(true);
      expect(fs.writeFile).toHaveBeenCalled();
      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      expect(writeCall[1]).toContain("Created by Hachiko Mock Agent");
      expect(result.createdFiles).toContain("src/new.ts");
      expect(result.modifiedFiles).toEqual([]);
    });

    it("should not modify files when modifyFiles is false", async () => {
      const noModifyAdapter = new MockAgentAdapter(mockPolicyConfig, {
        successRate: 1.0,
        executionTime: 0,
        modifyFiles: false,
      });

      const input: AgentInput = {
        planId: "test-plan",
        stepId: "no-modify-step",
        repoPath: "/tmp/test-repo",
        files: ["/tmp/test-repo/src/file.ts"],
        prompt: "Don't modify",
      };

      const result = await noModifyAdapter.execute(input);

      expect(result.success).toBe(true);
      expect(fs.readFile).not.toHaveBeenCalled();
      expect(fs.writeFile).not.toHaveBeenCalled();
      expect(result.modifiedFiles).toEqual([]);
      expect(result.createdFiles).toEqual([]);
    });

    it("should not modify files when execution fails", async () => {
      const failAdapter = new MockAgentAdapter(mockPolicyConfig, {
        successRate: 0.0, // Always fail
        executionTime: 0,
        modifyFiles: true,
      });

      const input: AgentInput = {
        planId: "test-plan",
        stepId: "fail-step",
        repoPath: "/tmp/test-repo",
        files: ["/tmp/test-repo/src/file.ts"],
        prompt: "This will fail",
      };

      const result = await failAdapter.execute(input);

      expect(result.success).toBe(false);
      expect(fs.readFile).not.toHaveBeenCalled();
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should handle errors during execution gracefully", async () => {
      // Create an adapter that will throw an error during enforceFilePolicy
      const errorAdapter = new MockAgentAdapter(
        {
          ...mockPolicyConfig,
          blockedPaths: ["**/*"], // Block everything to potentially cause issues
        },
        {
          successRate: 1.0,
          executionTime: 0,
        }
      );

      const input: AgentInput = {
        planId: "test-plan",
        stepId: "error-step",
        repoPath: "/tmp/test-repo",
        files: ["/tmp/test-repo/src/file.ts"],
        prompt: "Test error handling",
      };

      const result = await errorAdapter.execute(input);

      // Should fail due to policy violation
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.error).toBeDefined();
    });

    it("should catch and report unexpected errors with exit code -1", async () => {
      const errorAdapter = new MockAgentAdapter(mockPolicyConfig, {
        successRate: 1.0,
        executionTime: 0,
        modifyFiles: true,
      });

      // Mock enforceFilePolicy to throw an unexpected error
      vi.spyOn(errorAdapter as any, "enforceFilePolicy").mockRejectedValue(
        new Error("Unexpected error")
      );

      const input: AgentInput = {
        planId: "test-plan",
        stepId: "error-step",
        repoPath: "/tmp/test-repo",
        files: ["/tmp/test-repo/src/file.ts"],
        prompt: "Test unexpected error",
      };

      const result = await errorAdapter.execute(input);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(-1);
      expect(result.error).toBe("Unexpected error");
    });

    it("should handle non-Error exceptions", async () => {
      const errorAdapter = new MockAgentAdapter(mockPolicyConfig, {
        successRate: 1.0,
        executionTime: 0,
      });

      // Mock to throw a non-Error object
      vi.spyOn(errorAdapter as any, "enforceFilePolicy").mockRejectedValue(
        "String error message"
      );

      const input: AgentInput = {
        planId: "test-plan",
        stepId: "error-step",
        repoPath: "/tmp/test-repo",
        files: ["/tmp/test-repo/src/file.ts"],
        prompt: "Test non-Error exception",
      };

      const result = await errorAdapter.execute(input);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(-1);
      expect(result.error).toBe("String error message");
    });
  });
});
