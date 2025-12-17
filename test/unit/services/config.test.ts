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

import { loadHachikoConfig, validateConfig } from "../../../src/services/config.js";
import { ConfigurationError } from "../../../src/utils/errors.js";
import { loadFixture } from "../../helpers/test-utils.js";
import { createMockContext, mockGitHubResponses } from "../../mocks/github.js";

describe("loadHachikoConfig", () => {
  let mockContext: any;
  let mockOctokit: any;

  beforeEach(() => {
    mockOctokit = {
      repos: {
        getContent: vi.fn(),
      },
    };
    mockContext = createMockContext(
      "push",
      {
        repository: {
          owner: { login: "test-owner" },
          name: "test-repo",
        },
      },
      mockOctokit
    );
  });

  it("should load and validate a valid configuration file", async () => {
    const validConfig = loadFixture("configs/valid-hachiko-config.yml");
    mockOctokit.repos.getContent.mockResolvedValue(
      mockGitHubResponses.getContent.file(validConfig)
    );

    const result = await loadHachikoConfig(mockContext);

    expect(mockOctokit.repos.getContent).toHaveBeenCalledWith({
      owner: "test-owner",
      repo: "test-repo",
      path: ".hachiko.yml",
    });

    expect(result.plans.directory).toBe("migrations");
    expect(result.agents.claude.kind).toBe("cli");
    expect(result.defaults.agent).toBe("claude");
  });

  it("should return default configuration when .hachiko.yml does not exist", async () => {
    const notFoundError = new Error("Not Found") as any;
    notFoundError.status = 404;
    mockOctokit.repos.getContent.mockRejectedValue(notFoundError);

    const result = await loadHachikoConfig(mockContext);

    expect(result.plans.directory).toBe("migrations/");
    expect(result.defaults.agent).toBe("devin");
  });

  it("should throw ConfigurationError for invalid YAML", async () => {
    const invalidYaml = "invalid: yaml: content: [unclosed";
    mockOctokit.repos.getContent.mockResolvedValue(
      mockGitHubResponses.getContent.file(invalidYaml)
    );

    await expect(loadHachikoConfig(mockContext)).rejects.toThrow(ConfigurationError);
  });

  it("should throw ConfigurationError when config file is not a file", async () => {
    mockOctokit.repos.getContent.mockResolvedValue({
      data: [{ type: "dir", name: ".hachiko.yml" }],
    });

    await expect(loadHachikoConfig(mockContext)).rejects.toThrow(ConfigurationError);
  });

  it("should throw ConfigurationError for GitHub API errors", async () => {
    const apiError = new Error("API Error");
    mockOctokit.repos.getContent.mockRejectedValue(apiError);

    await expect(loadHachikoConfig(mockContext)).rejects.toThrow(ConfigurationError);
  });
});

describe("validateConfig", () => {
  it("should validate a valid configuration object", () => {
    const config = {
      plans: {
        directory: "migrations",
        extensions: [".md"],
      },
      defaults: {
        agent: "claude",
      },
    };

    const result = validateConfig(config);
    expect(result.plans.directory).toBe("migrations");
    expect(result.defaults.agent).toBe("claude");
  });

  it("should throw ConfigurationError for invalid configuration", () => {
    const invalidConfig = {
      agents: {
        "bad-agent": {
          kind: "invalid-kind", // This should cause validation to fail
          command: "test"
        }
      }
    };

    expect(() => validateConfig(invalidConfig)).toThrow(ConfigurationError);
  });

  it("should apply defaults to partial configuration", () => {
    const partialConfig = {
      agents: {
        custom: {
          kind: "cli" as const,
          command: "custom-agent",
        },
      },
    };

    const result = validateConfig(partialConfig);
    expect(result.plans.directory).toBe("migrations/");
    expect(result.defaults.agent).toBe("devin");
    expect(result.agents.custom.kind).toBe("cli");
  });
});
