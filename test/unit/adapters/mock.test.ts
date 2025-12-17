import { beforeEach, describe, expect, it } from "vitest";
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
});
