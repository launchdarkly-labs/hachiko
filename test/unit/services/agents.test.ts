import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import {
  AgentService,
  createAgentService,
  executeMigrationStep,
} from "../../../src/services/agents.js";
import type { HachikoConfig } from "../../../src/config/schema.js";
import type { ContextWithRepository } from "../../../src/types/context.js";
import type { AgentInput, AgentResult, AgentAdapter } from "../../../src/adapters/types.js";
import { AgentExecutionError } from "../../../src/utils/errors.js";

// Mock the registry module
vi.mock("../../../src/adapters/registry.js", () => {
  const mockAdapter: AgentAdapter = {
    name: "mock",
    execute: vi.fn(),
    validate: vi.fn().mockResolvedValue(true),
    getConfig: vi.fn().mockReturnValue({ name: "mock" }),
  };

  const mockRegistry = {
    getAdapter: vi.fn(),
    getAdapterNames: vi.fn().mockReturnValue(["mock", "test-agent"]),
    hasAdapter: vi.fn(),
    validateAllAdapters: vi.fn(),
  };

  return {
    createAgentRegistry: vi.fn().mockReturnValue(mockRegistry),
    initializeAgents: vi.fn().mockResolvedValue(mockRegistry),
    __mockRegistry: mockRegistry,
    __mockAdapter: mockAdapter,
  };
});

// Get references to mocked functions
import * as registry from "../../../src/adapters/registry.js";
const mockRegistry = (registry as any).__mockRegistry;
const mockAdapter = (registry as any).__mockAdapter;

describe("AgentService", () => {
  let agentService: AgentService;
  let mockConfig: HachikoConfig;

  beforeEach(() => {
    // Reset singleton between tests
    (AgentService as any).instance = null;

    vi.clearAllMocks();

    mockConfig = {
      plans: {
        directory: "migrations/",
        filenamePattern: "*.md",
      },
      defaults: {
        agent: "mock",
        prParallelism: 1,
        rebase: { when: "behind-base-branch", allowManual: true },
        labels: ["hachiko:migration"],
        requirePlanReview: true,
      },
      aiConfigs: {
        provider: "local",
        flagKeyPrefix: "hachiko_prompts_",
      },
      policy: {
        allowWorkflowEdits: false,
        network: "none",
        maxAttemptsPerStep: 2,
        stepTimeoutMinutes: 15,
        perRepoMaxConcurrentMigrations: 3,
        riskyGlobs: [".github/workflows/**", ".git/**"],
        allowlistGlobs: ["src/**"],
      },
      dependencies: {
        conflictResolution: "fail",
        updateStrategy: "manual",
      },
      agents: {},
    };

    agentService = AgentService.getInstance();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("getInstance", () => {
    it("should return the same instance (singleton)", () => {
      const instance1 = AgentService.getInstance();
      const instance2 = AgentService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("createAgentService", () => {
    it("should return the singleton instance", () => {
      const service1 = createAgentService();
      const service2 = AgentService.getInstance();
      expect(service1).toBe(service2);
    });
  });

  describe("initialize", () => {
    it("should initialize successfully", async () => {
      await agentService.initialize(mockConfig);

      expect(registry.initializeAgents).toHaveBeenCalledWith(mockConfig);
    });

    it("should only initialize once", async () => {
      await agentService.initialize(mockConfig);
      await agentService.initialize(mockConfig);

      expect(registry.initializeAgents).toHaveBeenCalledTimes(1);
    });

    it("should throw when initialization fails", async () => {
      vi.mocked(registry.initializeAgents).mockRejectedValueOnce(
        new Error("Initialization failed")
      );

      // Reset singleton to test fresh initialization
      (AgentService as any).instance = null;
      agentService = AgentService.getInstance();

      await expect(agentService.initialize(mockConfig)).rejects.toThrow("Initialization failed");
    });
  });

  describe("executeAgent", () => {
    const mockInput: AgentInput = {
      planId: "test-plan",
      stepId: "step-1",
      repoPath: "/tmp/repo",
      files: ["src/test.ts"],
      prompt: "Test migration",
    };

    const mockResult: AgentResult = {
      success: true,
      modifiedFiles: ["src/test.ts"],
      createdFiles: [],
      deletedFiles: [],
      output: "Success",
      exitCode: 0,
      executionTime: 1000,
    };

    beforeEach(async () => {
      await agentService.initialize(mockConfig);
      mockRegistry.getAdapter.mockReturnValue(mockAdapter);
      vi.mocked(mockAdapter.execute).mockResolvedValue(mockResult);
    });

    it("should execute agent successfully", async () => {
      const result = await agentService.executeAgent("mock", mockInput);

      expect(result).toEqual(mockResult);
      expect(mockRegistry.getAdapter).toHaveBeenCalledWith("mock");
      expect(mockAdapter.execute).toHaveBeenCalledWith(mockInput);
    });

    it("should throw AgentExecutionError when not initialized", async () => {
      // Reset singleton and don't initialize
      (AgentService as any).instance = null;
      const uninitializedService = AgentService.getInstance();

      await expect(uninitializedService.executeAgent("mock", mockInput)).rejects.toThrow(
        AgentExecutionError
      );
    });

    it("should throw AgentExecutionError when agent not found", async () => {
      mockRegistry.getAdapter.mockReturnValue(undefined);

      await expect(agentService.executeAgent("nonexistent", mockInput)).rejects.toThrow(
        AgentExecutionError
      );
      await expect(agentService.executeAgent("nonexistent", mockInput)).rejects.toThrow(
        /Agent nonexistent not found/
      );
    });

    it("should wrap execution errors in AgentExecutionError", async () => {
      vi.mocked(mockAdapter.execute).mockRejectedValue(new Error("Execution failed"));

      await expect(agentService.executeAgent("mock", mockInput)).rejects.toThrow(
        AgentExecutionError
      );
      await expect(agentService.executeAgent("mock", mockInput)).rejects.toThrow(
        /Agent execution failed/
      );
    });

    it("should handle non-Error exceptions", async () => {
      vi.mocked(mockAdapter.execute).mockRejectedValue("String error");

      await expect(agentService.executeAgent("mock", mockInput)).rejects.toThrow(
        AgentExecutionError
      );
    });
  });

  describe("getAvailableAgents", () => {
    it("should return empty array when not initialized", () => {
      const result = agentService.getAvailableAgents();
      expect(result).toEqual([]);
    });

    it("should return adapter names when initialized", async () => {
      await agentService.initialize(mockConfig);

      const result = agentService.getAvailableAgents();

      expect(result).toEqual(["mock", "test-agent"]);
    });
  });

  describe("validateAgents", () => {
    it("should return empty object when not initialized", async () => {
      const result = await agentService.validateAgents();
      expect(result).toEqual({});
    });

    it("should validate all adapters when initialized", async () => {
      await agentService.initialize(mockConfig);
      mockRegistry.validateAllAdapters.mockResolvedValue({
        mock: true,
        "test-agent": false,
      });

      const result = await agentService.validateAgents();

      expect(result).toEqual({
        mock: true,
        "test-agent": false,
      });
    });
  });

  describe("isAgentAvailable", () => {
    it("should return false when not initialized", () => {
      const result = agentService.isAgentAvailable("mock");
      expect(result).toBe(false);
    });

    it("should return true when agent exists", async () => {
      await agentService.initialize(mockConfig);
      mockRegistry.hasAdapter.mockReturnValue(true);

      const result = agentService.isAgentAvailable("mock");

      expect(result).toBe(true);
      expect(mockRegistry.hasAdapter).toHaveBeenCalledWith("mock");
    });

    it("should return false when agent does not exist", async () => {
      await agentService.initialize(mockConfig);
      mockRegistry.hasAdapter.mockReturnValue(false);

      const result = agentService.isAgentAvailable("nonexistent");

      expect(result).toBe(false);
    });
  });
});

describe("executeMigrationStep", () => {
  let mockContext: ContextWithRepository;
  let mockConfig: HachikoConfig;

  beforeEach(() => {
    // Reset singleton
    (AgentService as any).instance = null;
    vi.clearAllMocks();

    mockContext = {
      payload: {
        repository: {
          owner: { login: "test-owner" },
          name: "test-repo",
          full_name: "test-owner/test-repo",
          default_branch: "main",
        },
        sender: { login: "test-user" },
      },
      octokit: {},
    } as any;

    mockConfig = {
      plans: {
        directory: "migrations/",
        filenamePattern: "*.md",
      },
      defaults: {
        agent: "mock",
        prParallelism: 1,
        rebase: { when: "behind-base-branch", allowManual: true },
        labels: ["hachiko:migration"],
        requirePlanReview: true,
      },
      aiConfigs: {
        provider: "local",
        flagKeyPrefix: "hachiko_prompts_",
      },
      policy: {
        allowWorkflowEdits: false,
        network: "none",
        maxAttemptsPerStep: 2,
        stepTimeoutMinutes: 15,
        perRepoMaxConcurrentMigrations: 3,
        riskyGlobs: [".github/workflows/**", ".git/**"],
        allowlistGlobs: ["src/**"],
      },
      dependencies: {
        conflictResolution: "fail",
        updateStrategy: "manual",
      },
      agents: {},
    };

    // Setup mock adapter
    const mockResult: AgentResult = {
      success: true,
      modifiedFiles: ["src/test.ts"],
      createdFiles: [],
      deletedFiles: [],
      output: "Success",
      exitCode: 0,
      executionTime: 1000,
    };
    mockRegistry.getAdapter.mockReturnValue(mockAdapter);
    vi.mocked(mockAdapter.execute).mockResolvedValue(mockResult);
  });

  it("should execute migration step with correct input", async () => {
    const result = await executeMigrationStep(
      mockContext,
      "test-plan",
      "step-1",
      mockConfig,
      ["src/file.ts"],
      "Migrate the code"
    );

    expect(result.success).toBe(true);
    expect(mockAdapter.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: "test-plan",
        stepId: "step-1",
        files: ["src/file.ts"],
        prompt: "Migrate the code",
        timeout: 900, // 15 minutes * 60 seconds
        metadata: {
          repository: "test-owner/test-repo",
          actor: "test-user",
        },
      })
    );
  });

  it("should include chunk identifier when provided", async () => {
    await executeMigrationStep(
      mockContext,
      "test-plan",
      "step-1",
      mockConfig,
      ["src/file.ts"],
      "Migrate the code",
      "chunk-1"
    );

    expect(mockAdapter.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        chunk: "chunk-1",
      })
    );
  });

  it("should use default agent when config.defaults.agent is not set", async () => {
    const configWithoutAgent = {
      ...mockConfig,
      defaults: {
        ...mockConfig.defaults,
        agent: undefined,
      },
    };

    await executeMigrationStep(
      mockContext,
      "test-plan",
      "step-1",
      configWithoutAgent as any,
      ["src/file.ts"],
      "Migrate the code"
    );

    // Should fallback to "mock"
    expect(mockRegistry.getAdapter).toHaveBeenCalled();
  });
});
