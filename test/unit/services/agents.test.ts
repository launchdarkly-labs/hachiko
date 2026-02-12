import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AgentService,
  createAgentService,
  executeMigrationStep,
} from "../../../src/services/agents.js";
import * as registry from "../../../src/adapters/registry.js";
import type { AgentAdapter, AgentInput, AgentResult } from "../../../src/adapters/types.js";
import type { HachikoConfig } from "../../../src/config/schema.js";
import type { ContextWithRepository } from "../../../src/types/context.js";
import { AgentExecutionError } from "../../../src/utils/errors.js";

// Mock the registry module
vi.mock("../../../src/adapters/registry.js", () => ({
  createAgentRegistry: vi.fn(),
  initializeAgents: vi.fn(),
}));

describe("AgentService", () => {
  let agentService: AgentService;
  let mockAdapter: AgentAdapter;
  let mockRegistry: {
    getAdapter: ReturnType<typeof vi.fn>;
    getAdapterNames: ReturnType<typeof vi.fn>;
    hasAdapter: ReturnType<typeof vi.fn>;
    validateAllAdapters: ReturnType<typeof vi.fn>;
  };

  const mockConfig: HachikoConfig = {
    version: 1,
    defaults: {
      agent: "mock",
      baseBranch: "main",
    },
    policy: {
      maxConcurrentMigrations: 5,
      maxPRsPerMigration: 10,
      stepTimeoutMinutes: 30,
      allowlistGlobs: ["src/**"],
      riskyGlobs: [".env*"],
      network: "restricted",
    },
    agents: {
      mock: {
        kind: "cli",
        command: "echo",
      },
    },
    migration: {
      defaults: {
        baseBranch: "main",
        branchPrefix: "hachiko/",
      },
      migrations: [],
    },
    security: {},
  };

  const mockAgentInput: AgentInput = {
    planId: "test-plan",
    stepId: "step-1",
    repoPath: "/tmp/repo",
    files: ["src/test.ts"],
    prompt: "Test migration prompt",
    timeout: 30,
    metadata: {
      repository: "test-owner/test-repo",
      actor: "test-user",
    },
  };

  const mockSuccessResult: AgentResult = {
    success: true,
    modifiedFiles: ["src/test.ts"],
    createdFiles: [],
    deletedFiles: [],
    output: "Migration completed successfully",
    exitCode: 0,
    executionTime: 1500,
  };

  const mockFailureResult: AgentResult = {
    success: false,
    modifiedFiles: [],
    createdFiles: [],
    deletedFiles: [],
    output: "",
    error: "Agent execution failed",
    exitCode: 1,
    executionTime: 500,
  };

  beforeEach(() => {
    // Reset singleton state between tests
    (AgentService as any).instance = null;
    
    // Clear all mocks
    vi.clearAllMocks();

    mockAdapter = {
      name: "mock",
      execute: vi.fn(),
      validate: vi.fn().mockResolvedValue(true),
      getConfig: vi.fn().mockReturnValue({ name: "mock" }),
    };

    mockRegistry = {
      getAdapter: vi.fn(),
      getAdapterNames: vi.fn().mockReturnValue(["mock", "cursor"]),
      hasAdapter: vi.fn(),
      validateAllAdapters: vi.fn().mockResolvedValue({ mock: true, cursor: true }),
    };

    vi.mocked(registry.createAgentRegistry).mockReturnValue(mockRegistry as any);
    vi.mocked(registry.initializeAgents).mockResolvedValue(mockRegistry as any);

    agentService = AgentService.getInstance();
  });

  describe("singleton pattern", () => {
    it("should return the same instance", () => {
      const instance1 = AgentService.getInstance();
      const instance2 = AgentService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("should return the same instance via createAgentService", () => {
      const instance1 = createAgentService();
      const instance2 = AgentService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("initialize", () => {
    it("should initialize the agent service with configuration", async () => {
      await agentService.initialize(mockConfig);

      expect(registry.initializeAgents).toHaveBeenCalledWith(mockConfig);
    });

    it("should not reinitialize if already initialized", async () => {
      await agentService.initialize(mockConfig);
      await agentService.initialize(mockConfig);

      expect(registry.initializeAgents).toHaveBeenCalledTimes(1);
    });

    it("should propagate initialization errors", async () => {
      const initError = new Error("Initialization failed");
      vi.mocked(registry.initializeAgents).mockRejectedValueOnce(initError);

      await expect(agentService.initialize(mockConfig)).rejects.toThrow("Initialization failed");
    });
  });

  describe("executeAgent", () => {
    beforeEach(async () => {
      await agentService.initialize(mockConfig);
      mockRegistry.getAdapter.mockReturnValue(mockAdapter);
    });

    it("should execute agent successfully", async () => {
      vi.mocked(mockAdapter.execute).mockResolvedValue(mockSuccessResult);

      const result = await agentService.executeAgent("mock", mockAgentInput);

      expect(result).toEqual(mockSuccessResult);
      expect(mockAdapter.execute).toHaveBeenCalledWith(mockAgentInput);
    });

    it("should throw AgentExecutionError if service not initialized", async () => {
      // Reset singleton to get uninitialized state
      (AgentService as any).instance = null;
      const uninitializedService = AgentService.getInstance();

      await expect(uninitializedService.executeAgent("mock", mockAgentInput)).rejects.toThrow(
        AgentExecutionError
      );
      await expect(uninitializedService.executeAgent("mock", mockAgentInput)).rejects.toThrow(
        "Agent service not initialized"
      );
    });

    it("should throw AgentExecutionError if agent not found", async () => {
      mockRegistry.getAdapter.mockReturnValue(undefined);

      await expect(agentService.executeAgent("nonexistent", mockAgentInput)).rejects.toThrow(
        AgentExecutionError
      );
      await expect(agentService.executeAgent("nonexistent", mockAgentInput)).rejects.toThrow(
        "Agent nonexistent not found"
      );
    });

    it("should wrap agent execution errors in AgentExecutionError", async () => {
      const executionError = new Error("Execution failed");
      vi.mocked(mockAdapter.execute).mockRejectedValue(executionError);

      await expect(agentService.executeAgent("mock", mockAgentInput)).rejects.toThrow(
        AgentExecutionError
      );
      await expect(agentService.executeAgent("mock", mockAgentInput)).rejects.toThrow(
        "Agent execution failed: Execution failed"
      );
    });

    it("should wrap non-Error exceptions in AgentExecutionError", async () => {
      vi.mocked(mockAdapter.execute).mockRejectedValue("String error");

      await expect(agentService.executeAgent("mock", mockAgentInput)).rejects.toThrow(
        AgentExecutionError
      );
      await expect(agentService.executeAgent("mock", mockAgentInput)).rejects.toThrow(
        "Agent execution failed: String error"
      );
    });

    it("should handle agent returning failure result", async () => {
      vi.mocked(mockAdapter.execute).mockResolvedValue(mockFailureResult);

      const result = await agentService.executeAgent("mock", mockAgentInput);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Agent execution failed");
    });
  });

  describe("getAvailableAgents", () => {
    it("should return empty array if not initialized", () => {
      const uninitializedService = AgentService.getInstance();
      expect(uninitializedService.getAvailableAgents()).toEqual([]);
    });

    it("should return list of available agents when initialized", async () => {
      await agentService.initialize(mockConfig);

      const agents = agentService.getAvailableAgents();

      expect(agents).toEqual(["mock", "cursor"]);
      expect(mockRegistry.getAdapterNames).toHaveBeenCalled();
    });
  });

  describe("validateAgents", () => {
    it("should return empty object if not initialized", async () => {
      const uninitializedService = AgentService.getInstance();
      const result = await uninitializedService.validateAgents();
      expect(result).toEqual({});
    });

    it("should validate all agents when initialized", async () => {
      await agentService.initialize(mockConfig);

      const result = await agentService.validateAgents();

      expect(result).toEqual({ mock: true, cursor: true });
      expect(mockRegistry.validateAllAdapters).toHaveBeenCalled();
    });
  });

  describe("isAgentAvailable", () => {
    it("should return false if not initialized", () => {
      const uninitializedService = AgentService.getInstance();
      expect(uninitializedService.isAgentAvailable("mock")).toBe(false);
    });

    it("should return true for available agents", async () => {
      await agentService.initialize(mockConfig);
      mockRegistry.hasAdapter.mockReturnValue(true);

      expect(agentService.isAgentAvailable("mock")).toBe(true);
      expect(mockRegistry.hasAdapter).toHaveBeenCalledWith("mock");
    });

    it("should return false for unavailable agents", async () => {
      await agentService.initialize(mockConfig);
      mockRegistry.hasAdapter.mockReturnValue(false);

      expect(agentService.isAgentAvailable("nonexistent")).toBe(false);
    });
  });
});

describe("executeMigrationStep", () => {
  let mockAdapter: AgentAdapter;
  let mockRegistry: {
    getAdapter: ReturnType<typeof vi.fn>;
    getAdapterNames: ReturnType<typeof vi.fn>;
    hasAdapter: ReturnType<typeof vi.fn>;
    validateAllAdapters: ReturnType<typeof vi.fn>;
  };

  const mockContext: ContextWithRepository = {
    payload: {
      repository: {
        owner: { login: "test-owner" },
        name: "test-repo",
        full_name: "test-owner/test-repo",
        default_branch: "main",
      },
      sender: {
        login: "test-user",
      },
    },
    octokit: {} as any,
  } as any;

  const mockConfig: HachikoConfig = {
    version: 1,
    defaults: {
      agent: "mock",
      baseBranch: "main",
    },
    policy: {
      maxConcurrentMigrations: 5,
      maxPRsPerMigration: 10,
      stepTimeoutMinutes: 30,
      allowlistGlobs: ["src/**"],
      riskyGlobs: [".env*"],
      network: "restricted",
    },
    agents: {
      mock: {
        kind: "cli",
        command: "echo",
      },
    },
    migration: {
      defaults: {
        baseBranch: "main",
        branchPrefix: "hachiko/",
      },
      migrations: [],
    },
    security: {},
  };

  const mockSuccessResult: AgentResult = {
    success: true,
    modifiedFiles: ["src/test.ts"],
    createdFiles: [],
    deletedFiles: [],
    output: "Migration completed successfully",
    exitCode: 0,
    executionTime: 1500,
  };

  beforeEach(() => {
    // Reset singleton state
    (AgentService as any).instance = null;

    mockAdapter = {
      name: "mock",
      execute: vi.fn().mockResolvedValue(mockSuccessResult),
      validate: vi.fn().mockResolvedValue(true),
      getConfig: vi.fn().mockReturnValue({ name: "mock" }),
    };

    mockRegistry = {
      getAdapter: vi.fn().mockReturnValue(mockAdapter),
      getAdapterNames: vi.fn().mockReturnValue(["mock"]),
      hasAdapter: vi.fn().mockReturnValue(true),
      validateAllAdapters: vi.fn().mockResolvedValue({ mock: true }),
    };

    vi.mocked(registry.createAgentRegistry).mockReturnValue(mockRegistry as any);
    vi.mocked(registry.initializeAgents).mockResolvedValue(mockRegistry as any);
  });

  it("should execute migration step successfully", async () => {
    const result = await executeMigrationStep(
      mockContext,
      "test-plan",
      "step-1",
      mockConfig,
      ["src/test.ts"],
      "Test migration prompt"
    );

    expect(result).toEqual(mockSuccessResult);
    expect(mockAdapter.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: "test-plan",
        stepId: "step-1",
        files: ["src/test.ts"],
        prompt: "Test migration prompt",
        timeout: 1800, // 30 minutes in seconds
        metadata: {
          repository: "test-owner/test-repo",
          actor: "test-user",
        },
      })
    );
  });

  it("should pass chunk parameter if provided", async () => {
    await executeMigrationStep(
      mockContext,
      "test-plan",
      "step-1",
      mockConfig,
      ["src/test.ts"],
      "Test migration prompt",
      "chunk-1"
    );

    expect(mockAdapter.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        chunk: "chunk-1",
      })
    );
  });

  it("should use configured agent", async () => {
    const configWithCustomAgent = {
      ...mockConfig,
      defaults: {
        ...mockConfig.defaults,
        agent: "cursor",
      },
    };

    mockRegistry.getAdapter.mockImplementation((name: string) => {
      if (name === "cursor") return mockAdapter;
      return undefined;
    });

    await executeMigrationStep(
      mockContext,
      "test-plan",
      "step-1",
      configWithCustomAgent,
      ["src/test.ts"],
      "Test migration prompt"
    );

    expect(mockRegistry.getAdapter).toHaveBeenCalledWith("cursor");
  });

  it("should fallback to mock agent if no agent configured", async () => {
    const configWithNoAgent = {
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
      configWithNoAgent as any,
      ["src/test.ts"],
      "Test migration prompt"
    );

    expect(mockRegistry.getAdapter).toHaveBeenCalledWith("mock");
  });

  it("should handle missing sender gracefully", async () => {
    const contextWithNoSender = {
      ...mockContext,
      payload: {
        ...mockContext.payload,
        sender: undefined,
      },
    } as any;

    await executeMigrationStep(
      contextWithNoSender,
      "test-plan",
      "step-1",
      mockConfig,
      ["src/test.ts"],
      "Test migration prompt"
    );

    expect(mockAdapter.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          repository: "test-owner/test-repo",
          actor: undefined,
        },
      })
    );
  });

  it("should calculate timeout from config", async () => {
    const configWith60MinTimeout = {
      ...mockConfig,
      policy: {
        ...mockConfig.policy,
        stepTimeoutMinutes: 60,
      },
    };

    await executeMigrationStep(
      mockContext,
      "test-plan",
      "step-1",
      configWith60MinTimeout,
      ["src/test.ts"],
      "Test migration prompt"
    );

    expect(mockAdapter.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: 3600, // 60 minutes in seconds
      })
    );
  });
});
