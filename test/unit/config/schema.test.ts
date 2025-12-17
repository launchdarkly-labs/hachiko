import { describe, expect, it } from "vitest";
import { HachikoConfigSchema, validateHachikoConfig } from "../../../src/config/schema.js";

describe("HachikoConfigSchema", () => {
  it("should validate a complete valid configuration", () => {
    const config = {
      plans: {
        directory: "migrations",
        extensions: [".md"],
      },
      agents: {
        claude: {
          kind: "cli",
          command: "claude",
          args: ["--project", "{projectPath}"],
          timeout: 3600,
        },
      },
      defaults: {
        agent: "claude",
        labels: ["hachiko", "migration"],
        strategy: {
          chunkBy: "directory",
          maxOpenPRs: 3,
        },
      },
      policy: {
        allowlistGlobs: ["src/**", "test/**"],
        riskyGlobs: [".git/**", "node_modules/**"],
        maxAttemptsPerStep: 2,
        stepTimeoutMinutes: 15,
      },
      aiConfigs: {
        provider: "launchdarkly",
        flagKeyPrefix: "hachiko_prompts_",
      },
    };

    const result = validateHachikoConfig(config);
    expect(result.agents.claude.kind).toBe("cli");
    expect(result.defaults.agent).toBe("claude");
    expect(result.policy.allowlistGlobs).toContain("src/**");
  });

  it("should apply defaults for missing optional fields", () => {
    const minimalConfig = {};
    const result = validateHachikoConfig(minimalConfig);

    expect(result.plans.directory).toBe("migrations/");
    expect(result.plans.filenamePattern).toBe("*.md");
    expect(result.defaults.agent).toBe("devin");
    expect(result.defaults.prParallelism).toBe(1);
    expect(result.policy.maxAttemptsPerStep).toBe(2);
    expect(result.aiConfigs.provider).toBe("launchdarkly");
  });

  it("should validate parallelism configuration", () => {
    const config = {
      defaults: {
        prParallelism: 3,
      },
    };

    const result = validateHachikoConfig(config);
    expect(result.defaults.prParallelism).toBe(3);
  });

  it("should reject invalid parallelism values", () => {
    const config = {
      defaults: {
        prParallelism: 10, // Max is 5
      },
    };

    expect(() => validateHachikoConfig(config)).toThrow();
  });

  it("should validate agent configuration", () => {
    const config = {
      agents: {
        testAgent: {
          kind: "cli" as const,
          command: "test-agent",
          args: ["--flag"],
        },
      },
    };

    const result = validateHachikoConfig(config);
    expect(result.agents.testAgent.kind).toBe("cli");
    expect(result.agents.testAgent.command).toBe("test-agent");
    expect(result.agents.testAgent.args).toEqual(["--flag"]);
  });

  it("should validate CLI agent with timeout", () => {
    const config = {
      agents: {
        dockerAgent: {
          kind: "cli" as const,
          command: "docker-agent",
          timeout: 1800,
        },
      },
    };

    const result = validateHachikoConfig(config);
    expect(result.agents.dockerAgent.kind).toBe("cli");
    expect(result.agents.dockerAgent.timeout).toBe(1800);
  });

  it("should validate policy configuration", () => {
    const config = {
      policy: {
        allowlistGlobs: ["src/**", "lib/**"],
        riskyGlobs: [".git/**"],
        maxAttemptsPerStep: 3,
        stepTimeoutMinutes: 30,
      },
    };

    const result = validateHachikoConfig(config);
    expect(result.policy.allowlistGlobs).toEqual(["src/**", "lib/**"]);
    expect(result.policy.maxAttemptsPerStep).toBe(3);
    expect(result.policy.stepTimeoutMinutes).toBe(30);
  });

  it("should validate AI configs configuration", () => {
    const config = {
      aiConfigs: {
        provider: "launchdarkly" as const,
        flagKeyPrefix: "custom_prompts_",
      },
    };

    const result = validateHachikoConfig(config);
    expect(result.aiConfigs.provider).toBe("launchdarkly");
    expect(result.aiConfigs.flagKeyPrefix).toBe("custom_prompts_");
  });

  it("should reject negative prParallelism", () => {
    const config = {
      defaults: {
        prParallelism: 0,
      },
    };

    expect(() => validateHachikoConfig(config)).toThrow();
  });

  it("should reject invalid timeout values", () => {
    const config = {
      policy: {
        stepTimeoutMinutes: 0, // Min is 1
      },
    };

    expect(() => validateHachikoConfig(config)).toThrow();
  });
});
