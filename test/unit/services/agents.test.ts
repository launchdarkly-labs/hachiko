import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the logger before importing modules that use it
vi.mock("../../../src/utils/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  }),
}));

// Mock the registry module
const mockRegistry = {
  getAdapter: vi.fn(),
  getAdapterNames: vi.fn(),
  validateAllAdapters: vi.fn(),
  hasAdapter: vi.fn(),
};

const mockInitializeAgents = vi.fn();

vi.mock("../../../src/adapters/registry.js", () => ({
  createAgentRegistry: () => mockRegistry,
  initializeAgents: (...args: any[]) => mockInitializeAgents(...args),
}));

import { AgentService, createAgentService, executeMigrationStep } from "../../../src/services/agents.js";
import type { AgentInput, AgentResult } from "../../../src/adapters/types.js";
import type { HachikoConfig } from "../../../src/config/schema.js";
import { AgentExecutionError } from "../../../src/utils/errors.js";

describe("AgentService", () => {
  let agentService: AgentService;
  let mockConfig: HachikoConfig;
  let mockAdapter: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create a new instance for each test
    agentService = AgentService.getInstance();
    // Reset initialization state
    (agentService as any).initialized = false;

    // Create mock configuration
    mockConfig = {
      plans: { directory: "migrations/", extensions: [".md"] },
      agents: {
        mock: {
          kind: "cloud",
          provider: "mock",
        },
      },
      defaults: { agent: "mock" },
      policy: {
        allowlistGlobs: [],
        riskyGlobs: [],
        network: "none",
        stepTimeoutMinutes: 60,
      },
      workflow: {
        approvals: {
          enabled: false,
          required: 1,
          allowedTeams: [],
        },
      },
    } as unknown as HachikoConfig;

    // Create mock adapter
    mockAdapter = {
      name: "mock",
      execute: vi.fn(),
      validate: vi.fn().mockResolvedValue(true),
      getConfig: vi.fn().mockReturnValue({ provider: "mock" }),
    };

    // Setup mock registry
    mockRegistry.getAdapter.mockReturnValue(mockAdapter);
    mockRegistry.getAdapterNames.mockReturnValue(["mock"]);
    mockRegistry.validateAllAdapters.mockResolvedValue({ mock: true });
    mockRegistry.hasAdapter.mockReturnValue(true);
    mockInitializeAgents.mockResolvedValue(undefined);
  });

  describe("getInstance", () => {
    it("should return singleton instance", () => {
      const instance1 = AgentService.getInstance();
      const instance2 = AgentService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("initialize", () => {
    it("should initialize the agent service successfully", async () => {
      await agentService.initialize(mockConfig);

      expect(mockInitializeAgents).toHaveBeenCalledWith(mockConfig);
      expect((agentService as any).initialized).toBe(true);
    });

    it("should not reinitialize if already initialized", async () => {
      await agentService.initialize(mockConfig);
      await agentService.initialize(mockConfig);

      expect(mockInitializeAgents).toHaveBeenCalledTimes(1);
    });

    it("should throw error if initialization fails", async () => {
      const error = new Error("Initialization failed");
      mockInitializeAgents.mockRejectedValue(error);

      await expect(agentService.initialize(mockConfig)).rejects.toThrow("Initialization failed");
    });
  });

  describe("executeAgent", () => {
    const mockInput: AgentInput = {
      planId: "test-plan",
      stepId: "step-1",
      repoPath: "/tmp/repo",
      files: ["file1.ts", "file2.ts"],
      prompt: "Test prompt",
      timeout: 600,
      metadata: { repository: "test/repo", actor: "test-user" },
    };

    const mockResult: AgentResult = {
      success: true,
      modifiedFiles: ["file1.ts"],
      createdFiles: [],
      deletedFiles: [],
      output: "Test output",
      exitCode: 0,
      executionTime: 1000,
    };

    beforeEach(async () => {
      await agentService.initialize(mockConfig);
    });

    it("should execute agent successfully", async () => {
      mockAdapter.execute.mockResolvedValue(mockResult);

      const result = await agentService.executeAgent("mock", mockInput);

      expect(mockRegistry.getAdapter).toHaveBeenCalledWith("mock");
      expect(mockAdapter.execute).toHaveBeenCalledWith(mockInput);
      expect(result).toEqual(mockResult);
    });

    it("should throw error if service not initialized", async () => {
      const uninitializedService = AgentService.getInstance();
      (uninitializedService as any).initialized = false;

      await expect(uninitializedService.executeAgent("mock", mockInput)).rejects.toThrow(
        AgentExecutionError
      );
      await expect(uninitializedService.executeAgent("mock", mockInput)).rejects.toThrow(
        "Agent service not initialized"
      );
    });

    it("should throw error if agent not found", async () => {
      mockRegistry.getAdapter.mockReturnValue(undefined);

      await expect(agentService.executeAgent("nonexistent", mockInput)).rejects.toThrow(
        AgentExecutionError
      );
      await expect(agentService.executeAgent("nonexistent", mockInput)).rejects.toThrow(
        "Agent nonexistent not found"
      );
    });

    it("should handle agent execution errors", async () => {
      const executionError = new Error("Execution failed");
      mockAdapter.execute.mockRejectedValue(executionError);

      await expect(agentService.executeAgent("mock", mockInput)).rejects.toThrow(
        AgentExecutionError
      );
      await expect(agentService.executeAgent("mock", mockInput)).rejects.toThrow(
        "Agent execution failed: Execution failed"
      );
    });

    it("should handle non-Error execution failures", async () => {
      mockAdapter.execute.mockRejectedValue("String error");

      await expect(agentService.executeAgent("mock", mockInput)).rejects.toThrow(
        AgentExecutionError
      );
      await expect(agentService.executeAgent("mock", mockInput)).rejects.toThrow(
        "Agent execution failed: String error"
      );
    });
  });

  describe("getAvailableAgents", () => {
    it("should return available agents when initialized", async () => {
      await agentService.initialize(mockConfig);
      mockRegistry.getAdapterNames.mockReturnValue(["mock", "cursor", "devin"]);

      const agents = agentService.getAvailableAgents();

      expect(agents).toEqual(["mock", "cursor", "devin"]);
    });

    it("should return empty array when not initialized", () => {
      const agents = agentService.getAvailableAgents();

      expect(agents).toEqual([]);
    });
  });

  describe("validateAgents", () => {
    it("should validate all agents when initialized", async () => {
      await agentService.initialize(mockConfig);
      const validationResult = { mock: true, cursor: false };
      mockRegistry.validateAllAdapters.mockResolvedValue(validationResult);

      const result = await agentService.validateAgents();

      expect(result).toEqual(validationResult);
    });

    it("should return empty object when not initialized", async () => {
      const result = await agentService.validateAgents();

      expect(result).toEqual({});
    });
  });

  describe("isAgentAvailable", () => {
    it("should check if agent is available when initialized", async () => {
      await agentService.initialize(mockConfig);
      mockRegistry.hasAdapter.mockReturnValue(true);

      const isAvailable = agentService.isAgentAvailable("mock");

      expect(mockRegistry.hasAdapter).toHaveBeenCalledWith("mock");
      expect(isAvailable).toBe(true);
    });

    it("should return false when not initialized", () => {
      const isAvailable = agentService.isAgentAvailable("mock");

      expect(isAvailable).toBe(false);
    });

    it("should return false when agent does not exist", async () => {
      await agentService.initialize(mockConfig);
      mockRegistry.hasAdapter.mockReturnValue(false);

      const isAvailable = agentService.isAgentAvailable("nonexistent");

      expect(isAvailable).toBe(false);
    });
  });
});

describe("createAgentService", () => {
  it("should return agent service instance", () => {
    const service = createAgentService();
    expect(service).toBeInstanceOf(AgentService);
  });

  it("should return the same singleton instance", () => {
    const service1 = createAgentService();
    const service2 = createAgentService();
    expect(service1).toBe(service2);
  });
});

describe("executeMigrationStep", () => {
  let mockContext: any;
  let mockConfig: HachikoConfig;
  let mockAdapter: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset agent service
    const service = AgentService.getInstance();
    (service as any).initialized = false;

    mockContext = {
      payload: {
        repository: {
          full_name: "test/repo",
          owner: { login: "test" },
          name: "repo",
        },
        sender: { login: "test-user" },
      },
    };

    mockConfig = {
      plans: { directory: "migrations/", extensions: [".md"] },
      agents: { mock: { kind: "cloud", provider: "mock" } },
      defaults: { agent: "mock" },
      policy: {
        allowlistGlobs: [],
        riskyGlobs: [],
        network: "none",
        stepTimeoutMinutes: 60,
      },
      workflow: {
        approvals: { enabled: false, required: 1, allowedTeams: [] },
      },
    } as unknown as HachikoConfig;

    mockAdapter = {
      name: "mock",
      execute: vi.fn().mockResolvedValue({
        success: true,
        modifiedFiles: ["file1.ts"],
        createdFiles: [],
        deletedFiles: [],
        output: "Success",
        exitCode: 0,
        executionTime: 1000,
      }),
      validate: vi.fn().mockResolvedValue(true),
      getConfig: vi.fn().mockReturnValue({}),
    };

    mockRegistry.getAdapter.mockReturnValue(mockAdapter);
    mockInitializeAgents.mockResolvedValue(undefined);
  });

  it("should execute migration step successfully", async () => {
    const result = await executeMigrationStep(
      mockContext,
      "test-plan",
      "step-1",
      mockConfig,
      ["file1.ts", "file2.ts"],
      "Test prompt"
    );

    expect(mockInitializeAgents).toHaveBeenCalledWith(mockConfig);
    expect(mockAdapter.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: "test-plan",
        stepId: "step-1",
        files: ["file1.ts", "file2.ts"],
        prompt: "Test prompt",
        timeout: 3600, // 60 minutes * 60 seconds
        metadata: {
          repository: "test/repo",
          actor: "test-user",
        },
      })
    );
    expect(result.success).toBe(true);
  });

  it("should use default agent when not specified in config", async () => {
    mockConfig.defaults.agent = "mock";

    await executeMigrationStep(
      mockContext,
      "plan-1",
      "step-1",
      mockConfig,
      ["file.ts"],
      "Prompt"
    );

    expect(mockRegistry.getAdapter).toHaveBeenCalledWith("mock");
  });

  it("should handle chunk parameter", async () => {
    await executeMigrationStep(
      mockContext,
      "plan-1",
      "step-1",
      mockConfig,
      ["file.ts"],
      "Prompt",
      "chunk-1"
    );

    expect(mockAdapter.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        chunk: "chunk-1",
      })
    );
  });

  it("should handle missing sender in payload", async () => {
    mockContext.payload.sender = undefined;

    await executeMigrationStep(
      mockContext,
      "plan-1",
      "step-1",
      mockConfig,
      ["file.ts"],
      "Prompt"
    );

    expect(mockAdapter.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          repository: "test/repo",
          actor: "unknown",
        },
      })
    );
  });

  it("should construct repository name from owner and name if full_name missing", async () => {
    mockContext.payload.repository.full_name = undefined;

    await executeMigrationStep(
      mockContext,
      "plan-1",
      "step-1",
      mockConfig,
      ["file.ts"],
      "Prompt"
    );

    expect(mockAdapter.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          repository: "test/repo",
          actor: "test-user",
        },
      })
    );
  });
});
