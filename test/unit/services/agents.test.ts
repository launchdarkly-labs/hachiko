import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AgentService,
  createAgentService,
  executeMigrationStep,
} from "../../../src/services/agents.js";
import type { AgentAdapter, AgentInput, AgentResult } from "../../../src/adapters/types.js";
import type { HachikoConfig } from "../../../src/config/schema.js";
import type { ContextWithRepository } from "../../../src/types/context.js";
import { AgentExecutionError } from "../../../src/utils/errors.js";

// Mock the registry module
vi.mock("../../../src/adapters/registry.js", () => {
  const mockAdapter: AgentAdapter = {
    name: "mock-adapter",
    execute: vi.fn(),
    validate: vi.fn(),
    getConfig: vi.fn(() => ({})),
  };

  const mockRegistry = {
    getAdapter: vi.fn(),
    getAdapterNames: vi.fn(() => ["mock", "devin", "cursor"]),
    hasAdapter: vi.fn(),
    validateAllAdapters: vi.fn(),
  };

  return {
    createAgentRegistry: vi.fn(() => mockRegistry),
    initializeAgents: vi.fn(),
    AgentRegistry: {
      getInstance: vi.fn(() => mockRegistry),
    },
    __mockAdapter: mockAdapter,
    __mockRegistry: mockRegistry,
  };
});

// Import the mocked module to access mock functions
import * as registryModule from "../../../src/adapters/registry.js";

describe("AgentService", () => {
  let agentService: AgentService;
  let mockConfig: HachikoConfig;
  let mockAdapter: AgentAdapter;
  let mockRegistry: ReturnType<typeof registryModule.createAgentRegistry>;

  beforeEach(() => {
    // Reset singleton instance before each test
    (AgentService as any).instance = null;

    // Get references to mock functions
    mockRegistry = registryModule.createAgentRegistry();
    mockAdapter = {
      name: "test-adapter",
      execute: vi.fn(),
      validate: vi.fn().mockResolvedValue(true),
      getConfig: vi.fn(() => ({ test: true })),
    };

    mockConfig = {
      plans: { directory: "migrations/", filenamePattern: "*.md" },
      defaults: {
        agent: "mock",
        prParallelism: 1,
        rebase: { when: "behind-base-branch", allowManual: true },
        labels: ["hachiko:migration"],
        requirePlanReview: true,
      },
      aiConfigs: { provider: "launchdarkly", flagKeyPrefix: "hachiko_prompts_" },
      policy: {
        allowWorkflowEdits: false,
        network: "none",
        maxAttemptsPerStep: 2,
        stepTimeoutMinutes: 15,
        perRepoMaxConcurrentMigrations: 3,
        riskyGlobs: [".github/workflows/**", ".git/**", "**/*.sh"],
        allowlistGlobs: ["src/**", "services/**", "packages/**", "modules/**"],
      },
      dependencies: { conflictResolution: "fail", updateStrategy: "manual" },
      agents: {
        mock: { kind: "cloud", provider: "devin" },
      },
    };

    // Reset mocks
    vi.clearAllMocks();
    agentService = AgentService.getInstance();
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
    it("should initialize the agent service", async () => {
      vi.mocked(registryModule.initializeAgents).mockResolvedValue(mockRegistry as any);

      await agentService.initialize(mockConfig);

      expect(registryModule.initializeAgents).toHaveBeenCalledWith(mockConfig);
    });

    it("should only initialize once", async () => {
      vi.mocked(registryModule.initializeAgents).mockResolvedValue(mockRegistry as any);

      await agentService.initialize(mockConfig);
      await agentService.initialize(mockConfig);

      expect(registryModule.initializeAgents).toHaveBeenCalledTimes(1);
    });

    it("should throw error if initialization fails", async () => {
      const error = new Error("Initialization failed");
      vi.mocked(registryModule.initializeAgents).mockRejectedValue(error);

      await expect(agentService.initialize(mockConfig)).rejects.toThrow("Initialization failed");
    });
  });

  describe("executeAgent", () => {
    const mockInput: AgentInput = {
      planId: "test-migration",
      stepId: "step-1",
      repoPath: "/tmp/repo",
      files: ["src/file1.ts", "src/file2.ts"],
      prompt: "Update these files",
      timeout: 600,
    };

    const mockResult: AgentResult = {
      success: true,
      modifiedFiles: ["src/file1.ts"],
      createdFiles: [],
      deletedFiles: [],
      output: "Changes applied successfully",
      exitCode: 0,
      executionTime: 5000,
    };

    it("should throw AgentExecutionError if service not initialized", async () => {
      await expect(agentService.executeAgent("mock", mockInput)).rejects.toThrow(
        AgentExecutionError
      );
    });

    it("should throw AgentExecutionError if agent not found", async () => {
      vi.mocked(registryModule.initializeAgents).mockResolvedValue(mockRegistry as any);
      vi.mocked(mockRegistry.getAdapter).mockReturnValue(undefined);

      await agentService.initialize(mockConfig);

      await expect(agentService.executeAgent("nonexistent", mockInput)).rejects.toThrow(
        AgentExecutionError
      );
    });

    it("should execute agent successfully", async () => {
      vi.mocked(registryModule.initializeAgents).mockResolvedValue(mockRegistry as any);
      vi.mocked(mockRegistry.getAdapter).mockReturnValue(mockAdapter);
      vi.mocked(mockAdapter.execute).mockResolvedValue(mockResult);

      await agentService.initialize(mockConfig);
      const result = await agentService.executeAgent("mock", mockInput);

      expect(result).toEqual(mockResult);
      expect(mockAdapter.execute).toHaveBeenCalledWith(mockInput);
    });

    it("should wrap execution errors in AgentExecutionError", async () => {
      vi.mocked(registryModule.initializeAgents).mockResolvedValue(mockRegistry as any);
      vi.mocked(mockRegistry.getAdapter).mockReturnValue(mockAdapter);
      vi.mocked(mockAdapter.execute).mockRejectedValue(new Error("Execution failed"));

      await agentService.initialize(mockConfig);

      await expect(agentService.executeAgent("mock", mockInput)).rejects.toThrow(
        AgentExecutionError
      );
    });

    it("should handle non-Error execution failures", async () => {
      vi.mocked(registryModule.initializeAgents).mockResolvedValue(mockRegistry as any);
      vi.mocked(mockRegistry.getAdapter).mockReturnValue(mockAdapter);
      vi.mocked(mockAdapter.execute).mockRejectedValue("String error");

      await agentService.initialize(mockConfig);

      await expect(agentService.executeAgent("mock", mockInput)).rejects.toThrow(
        AgentExecutionError
      );
    });

    it("should handle input with chunk parameter", async () => {
      vi.mocked(registryModule.initializeAgents).mockResolvedValue(mockRegistry as any);
      vi.mocked(mockRegistry.getAdapter).mockReturnValue(mockAdapter);
      vi.mocked(mockAdapter.execute).mockResolvedValue(mockResult);

      const inputWithChunk: AgentInput = {
        ...mockInput,
        chunk: "chunk-1",
      };

      await agentService.initialize(mockConfig);
      await agentService.executeAgent("mock", inputWithChunk);

      expect(mockAdapter.execute).toHaveBeenCalledWith(inputWithChunk);
    });
  });

  describe("getAvailableAgents", () => {
    it("should return empty array if service not initialized", () => {
      const result = agentService.getAvailableAgents();
      expect(result).toEqual([]);
    });

    it("should return list of available agents when initialized", async () => {
      vi.mocked(registryModule.initializeAgents).mockResolvedValue(mockRegistry as any);
      vi.mocked(mockRegistry.getAdapterNames).mockReturnValue(["mock", "devin", "cursor"]);

      await agentService.initialize(mockConfig);
      const result = agentService.getAvailableAgents();

      expect(result).toEqual(["mock", "devin", "cursor"]);
    });
  });

  describe("validateAgents", () => {
    it("should return empty object if service not initialized", async () => {
      const result = await agentService.validateAgents();
      expect(result).toEqual({});
    });

    it("should return validation results for all adapters", async () => {
      const validationResults = { mock: true, devin: true, cursor: false };
      vi.mocked(registryModule.initializeAgents).mockResolvedValue(mockRegistry as any);
      vi.mocked(mockRegistry.validateAllAdapters).mockResolvedValue(validationResults);

      await agentService.initialize(mockConfig);
      const result = await agentService.validateAgents();

      expect(result).toEqual(validationResults);
    });
  });

  describe("isAgentAvailable", () => {
    it("should return false if service not initialized", () => {
      const result = agentService.isAgentAvailable("mock");
      expect(result).toBe(false);
    });

    it("should return true for registered agents", async () => {
      vi.mocked(registryModule.initializeAgents).mockResolvedValue(mockRegistry as any);
      vi.mocked(mockRegistry.hasAdapter).mockReturnValue(true);

      await agentService.initialize(mockConfig);
      const result = agentService.isAgentAvailable("mock");

      expect(result).toBe(true);
    });

    it("should return false for unregistered agents", async () => {
      vi.mocked(registryModule.initializeAgents).mockResolvedValue(mockRegistry as any);
      vi.mocked(mockRegistry.hasAdapter).mockReturnValue(false);

      await agentService.initialize(mockConfig);
      const result = agentService.isAgentAvailable("nonexistent");

      expect(result).toBe(false);
    });
  });
});

describe("executeMigrationStep", () => {
  let mockContext: ContextWithRepository;
  let mockConfig: HachikoConfig;
  let mockRegistry: ReturnType<typeof registryModule.createAgentRegistry>;
  let mockAdapter: AgentAdapter;

  beforeEach(() => {
    // Reset singleton
    (AgentService as any).instance = null;

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
    } as any;

    mockConfig = {
      plans: { directory: "migrations/", filenamePattern: "*.md" },
      defaults: {
        agent: "mock",
        prParallelism: 1,
        rebase: { when: "behind-base-branch", allowManual: true },
        labels: ["hachiko:migration"],
        requirePlanReview: true,
      },
      aiConfigs: { provider: "launchdarkly", flagKeyPrefix: "hachiko_prompts_" },
      policy: {
        allowWorkflowEdits: false,
        network: "none",
        maxAttemptsPerStep: 2,
        stepTimeoutMinutes: 15,
        perRepoMaxConcurrentMigrations: 3,
        riskyGlobs: [".github/workflows/**"],
        allowlistGlobs: ["src/**"],
      },
      dependencies: { conflictResolution: "fail", updateStrategy: "manual" },
      agents: {
        mock: { kind: "cloud", provider: "devin" },
      },
    };

    mockRegistry = registryModule.createAgentRegistry();
    mockAdapter = {
      name: "mock",
      execute: vi.fn(),
      validate: vi.fn().mockResolvedValue(true),
      getConfig: vi.fn(() => ({})),
    };

    vi.clearAllMocks();
  });

  it("should execute migration step with correct input", async () => {
    const mockResult: AgentResult = {
      success: true,
      modifiedFiles: ["src/test.ts"],
      createdFiles: [],
      deletedFiles: [],
      output: "Success",
      exitCode: 0,
      executionTime: 1000,
    };

    vi.mocked(registryModule.initializeAgents).mockResolvedValue(mockRegistry as any);
    vi.mocked(mockRegistry.getAdapter).mockReturnValue(mockAdapter);
    vi.mocked(mockAdapter.execute).mockResolvedValue(mockResult);

    const result = await executeMigrationStep(
      mockContext,
      "test-migration",
      "step-1",
      mockConfig,
      ["src/test.ts"],
      "Make changes to the file"
    );

    expect(result).toEqual(mockResult);
    expect(mockAdapter.execute).toHaveBeenCalledWith({
      planId: "test-migration",
      stepId: "step-1",
      chunk: undefined,
      repoPath: "/tmp/repo",
      files: ["src/test.ts"],
      prompt: "Make changes to the file",
      timeout: 900, // 15 minutes * 60
      metadata: {
        repository: "test-owner/test-repo",
        actor: "test-user",
      },
    });
  });

  it("should include chunk in input when provided", async () => {
    const mockResult: AgentResult = {
      success: true,
      modifiedFiles: [],
      createdFiles: [],
      deletedFiles: [],
      output: "Success",
      exitCode: 0,
      executionTime: 500,
    };

    vi.mocked(registryModule.initializeAgents).mockResolvedValue(mockRegistry as any);
    vi.mocked(mockRegistry.getAdapter).mockReturnValue(mockAdapter);
    vi.mocked(mockAdapter.execute).mockResolvedValue(mockResult);

    await executeMigrationStep(
      mockContext,
      "test-migration",
      "step-1",
      mockConfig,
      ["src/chunk1.ts"],
      "Process chunk",
      "chunk-1"
    );

    expect(mockAdapter.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        chunk: "chunk-1",
      })
    );
  });

  it("should use default agent when none specified", async () => {
    const mockResult: AgentResult = {
      success: true,
      modifiedFiles: [],
      createdFiles: [],
      deletedFiles: [],
      output: "Success",
      exitCode: 0,
      executionTime: 500,
    };

    vi.mocked(registryModule.initializeAgents).mockResolvedValue(mockRegistry as any);
    vi.mocked(mockRegistry.getAdapter).mockReturnValue(mockAdapter);
    vi.mocked(mockAdapter.execute).mockResolvedValue(mockResult);

    await executeMigrationStep(
      mockContext,
      "test-migration",
      "step-1",
      mockConfig,
      ["src/file.ts"],
      "Test prompt"
    );

    // Should use "mock" which is the default agent in config
    expect(mockRegistry.getAdapter).toHaveBeenCalledWith("mock");
  });

  it("should handle missing sender in context", async () => {
    const contextWithoutSender: ContextWithRepository = {
      payload: {
        repository: {
          owner: { login: "test-owner" },
          name: "test-repo",
          full_name: "test-owner/test-repo",
          default_branch: "main",
        },
      },
    } as any;

    const mockResult: AgentResult = {
      success: true,
      modifiedFiles: [],
      createdFiles: [],
      deletedFiles: [],
      output: "Success",
      exitCode: 0,
      executionTime: 500,
    };

    vi.mocked(registryModule.initializeAgents).mockResolvedValue(mockRegistry as any);
    vi.mocked(mockRegistry.getAdapter).mockReturnValue(mockAdapter);
    vi.mocked(mockAdapter.execute).mockResolvedValue(mockResult);

    await executeMigrationStep(
      contextWithoutSender,
      "test-migration",
      "step-1",
      mockConfig,
      ["src/file.ts"],
      "Test prompt"
    );

    expect(mockAdapter.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          actor: undefined,
        }),
      })
    );
  });
});
