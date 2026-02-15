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

import {
  PolicyEngine,
  createPolicyEngine,
  initializePolicyEngine,
  PolicyRuleType,
  PolicySeverity,
  type PolicyContext,
  type PolicyRule,
} from "../../../src/services/policy-engine.js";
import type { HachikoConfig } from "../../../src/config/schema.js";
import { PolicyViolationError } from "../../../src/utils/errors.js";

describe("PolicyEngine", () => {
  let policyEngine: PolicyEngine;
  let mockConfig: HachikoConfig;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create a new instance for each test
    policyEngine = PolicyEngine.getInstance();
    // Reset initialization state
    (policyEngine as any).initialized = false;
    (policyEngine as any).rules = [];
    (policyEngine as any).config = null;

    // Create mock configuration
    mockConfig = {
      plans: { directory: "migrations/", extensions: [".md"] },
      agents: {},
      defaults: { agent: "mock" },
      policy: {
        allowlistGlobs: ["src/**/*.ts", "test/**/*.ts"],
        riskyGlobs: ["**/.env*", "**/secrets/**"],
        network: "none",
        stepTimeoutMinutes: 60,
      },
      workflow: {
        approvals: { enabled: false, required: 1, allowedTeams: [] },
      },
    } as unknown as HachikoConfig;
  });

  describe("getInstance", () => {
    it("should return singleton instance", () => {
      const instance1 = PolicyEngine.getInstance();
      const instance2 = PolicyEngine.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("initialize", () => {
    it("should initialize the policy engine successfully", async () => {
      await policyEngine.initialize(mockConfig);

      expect((policyEngine as any).initialized).toBe(true);
      expect((policyEngine as any).config).toBe(mockConfig);
      expect((policyEngine as any).rules.length).toBeGreaterThan(0);
    });

    it("should not reinitialize if already initialized", async () => {
      await policyEngine.initialize(mockConfig);
      const rulesCount = (policyEngine as any).rules.length;

      await policyEngine.initialize(mockConfig);

      expect((policyEngine as any).rules.length).toBe(rulesCount);
    });

    it("should load built-in policy rules", async () => {
      await policyEngine.initialize(mockConfig);

      const rules = policyEngine.getRules();
      const ruleIds = rules.map((r) => r.id);

      expect(ruleIds).toContain("block_sensitive_files");
      expect(ruleIds).toContain("block_risky_paths");
      expect(ruleIds).toContain("enforce_allowlist");
      expect(ruleIds).toContain("limit_execution_time");
      expect(ruleIds).toContain("block_dangerous_commands");
      expect(ruleIds).toContain("require_write_permissions");
    });

    it("should create risky globs rule when configured", async () => {
      mockConfig.policy.riskyGlobs = ["**/.env*", "**/passwords/**"];

      await policyEngine.initialize(mockConfig);

      const rule = policyEngine.getRules().find((r) => r.id === "block_risky_paths");
      expect(rule).toBeDefined();
      expect(rule?.conditions[0].value).toEqual(mockConfig.policy.riskyGlobs);
    });

    it("should create allowlist rule when configured", async () => {
      mockConfig.policy.allowlistGlobs = ["src/**/*.ts"];

      await policyEngine.initialize(mockConfig);

      const rule = policyEngine.getRules().find((r) => r.id === "enforce_allowlist");
      expect(rule).toBeDefined();
      expect(rule?.conditions[0].value).toEqual(mockConfig.policy.allowlistGlobs);
    });

    it("should create network blocking rule when network is none", async () => {
      mockConfig.policy.network = "none";

      await policyEngine.initialize(mockConfig);

      const rule = policyEngine.getRules().find((r) => r.id === "block_network_access");
      expect(rule).toBeDefined();
    });

    it("should not create network blocking rule when network is not none", async () => {
      mockConfig.policy.network = "restricted";

      await policyEngine.initialize(mockConfig);

      const rule = policyEngine.getRules().find((r) => r.id === "block_network_access");
      expect(rule).toBeUndefined();
    });
  });

  describe("evaluatePolicies", () => {
    let policyContext: PolicyContext;

    beforeEach(async () => {
      await policyEngine.initialize(mockConfig);

      policyContext = {
        planId: "test-plan",
        stepId: "step-1",
        repository: {
          owner: "test",
          name: "repo",
          defaultBranch: "main",
          isPrivate: false,
        },
        user: {
          login: "test-user",
          type: "User",
          permissions: ["write"],
        },
        files: ["src/index.ts"],
        commands: [],
        networkRequests: [],
        environment: "github-actions",
      };
    });

    it("should throw error if not initialized", async () => {
      const uninitializedEngine = PolicyEngine.getInstance();
      (uninitializedEngine as any).initialized = false;

      await expect(uninitializedEngine.evaluatePolicies(policyContext)).rejects.toThrow(
        PolicyViolationError
      );
    });

    it("should allow safe file access", async () => {
      policyContext.files = ["src/utils/helper.ts"];

      const result = await policyEngine.evaluatePolicies(policyContext);

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it("should block access to sensitive files", async () => {
      policyContext.files = [".env", "src/secrets/api-key.txt"];

      const result = await policyEngine.evaluatePolicies(policyContext);

      expect(result.allowed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].type).toBe("file_access");
    });

    it("should block access to risky paths", async () => {
      policyContext.files = ["secrets/password.txt"];

      const result = await policyEngine.evaluatePolicies(policyContext);

      expect(result.allowed).toBe(false);
      expect(result.violations.some((v) => v.pattern === "block_risky_paths")).toBe(true);
    });

    it("should block files outside allowlist", async () => {
      policyContext.files = ["unauthorized/file.txt"];

      const result = await policyEngine.evaluatePolicies(policyContext);

      expect(result.allowed).toBe(false);
      expect(result.violations.some((v) => v.pattern === "enforce_allowlist")).toBe(true);
    });

    it("should block dangerous commands", async () => {
      policyContext.commands = ["rm -rf /", "sudo apt install"];

      const result = await policyEngine.evaluatePolicies(policyContext);

      expect(result.allowed).toBe(false);
      expect(result.violations.some((v) => v.type === "command_execution")).toBe(true);
    });

    it("should create network blocking rule when network policy is none", async () => {
      // Verify that the network blocking rule exists when policy is "none"
      const rules = policyEngine.getRules();
      const networkRule = rules.find((r) => r.id === "block_network_access");
      
      expect(networkRule).toBeDefined();
      expect(networkRule?.enabled).toBe(true);
      expect(networkRule?.severity).toBe(PolicySeverity.ERROR);
    });

    it("should block bot users", async () => {
      policyContext.user.type = "Bot";

      const result = await policyEngine.evaluatePolicies(policyContext);

      expect(result.allowed).toBe(false);
      expect(result.violations.some((v) => v.pattern === "require_write_permissions")).toBe(true);
    });

    it("should generate warnings for non-critical violations", async () => {
      const warningRule: PolicyRule = {
        id: "test_warning",
        name: "Test Warning",
        description: "Test warning rule",
        type: PolicyRuleType.FILE_ACCESS,
        severity: PolicySeverity.WARNING,
        enabled: true,
        conditions: [
          {
            field: "files",
            operator: "matches",
            value: ["**/test/**"],
          },
        ],
        actions: [{ type: "warn", message: "Test warning" }],
      };

      policyEngine.addRule(warningRule);
      policyContext.files = ["test/file.ts"];

      const result = await policyEngine.evaluatePolicies(policyContext);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.pattern === "test_warning")).toBe(true);
    });

    it("should set requiresApproval when rule action requires approval", async () => {
      const approvalRule: PolicyRule = {
        id: "test_approval",
        name: "Test Approval",
        description: "Test approval rule",
        type: PolicyRuleType.FILE_ACCESS,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [
          {
            field: "files",
            operator: "matches",
            value: ["**/critical/**"],
          },
        ],
        actions: [{ type: "require_approval" }],
      };

      policyEngine.addRule(approvalRule);
      policyContext.files = ["src/critical/important.ts"];

      const result = await policyEngine.evaluatePolicies(policyContext);

      expect(result.requiresApproval).toBe(true);
    });

    it("should skip disabled rules", async () => {
      const disabledRule: PolicyRule = {
        id: "test_disabled",
        name: "Test Disabled",
        description: "Test disabled rule",
        type: PolicyRuleType.FILE_ACCESS,
        severity: PolicySeverity.ERROR,
        enabled: false,
        conditions: [
          {
            field: "files",
            operator: "matches",
            value: ["**/*"],
          },
        ],
        actions: [{ type: "block" }],
      };

      policyEngine.addRule(disabledRule);

      const result = await policyEngine.evaluatePolicies(policyContext);

      expect(result.violations.some((v) => v.pattern === "test_disabled")).toBe(false);
    });

    it("should handle rule evaluation errors gracefully", async () => {
      const badRule: PolicyRule = {
        id: "bad_rule",
        name: "Bad Rule",
        description: "Bad rule",
        type: PolicyRuleType.FILE_ACCESS,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [
          {
            field: "nonexistent.deeply.nested.field",
            operator: "equals",
            value: "test",
          },
        ],
        actions: [{ type: "block" }],
      };

      policyEngine.addRule(badRule);

      const result = await policyEngine.evaluatePolicies(policyContext);

      // Should not crash, just skip the bad rule
      expect(result).toBeDefined();
    });
  });

  describe("addRule", () => {
    beforeEach(async () => {
      await policyEngine.initialize(mockConfig);
    });

    it("should add a new rule", () => {
      const newRule: PolicyRule = {
        id: "test_rule",
        name: "Test Rule",
        description: "Test description",
        type: PolicyRuleType.FILE_ACCESS,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [],
        actions: [],
      };

      policyEngine.addRule(newRule);

      const rules = policyEngine.getRules();
      expect(rules.some((r) => r.id === "test_rule")).toBe(true);
    });

    it("should update existing rule", () => {
      const rule1: PolicyRule = {
        id: "test_rule",
        name: "Original",
        description: "Original",
        type: PolicyRuleType.FILE_ACCESS,
        severity: PolicySeverity.WARNING,
        enabled: true,
        conditions: [],
        actions: [],
      };

      const rule2: PolicyRule = {
        id: "test_rule",
        name: "Updated",
        description: "Updated",
        type: PolicyRuleType.FILE_ACCESS,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [],
        actions: [],
      };

      policyEngine.addRule(rule1);
      const rulesCountBefore = policyEngine.getRules().length;

      policyEngine.addRule(rule2);
      const rulesCountAfter = policyEngine.getRules().length;

      expect(rulesCountBefore).toBe(rulesCountAfter);
      const updatedRule = policyEngine.getRules().find((r) => r.id === "test_rule");
      expect(updatedRule?.name).toBe("Updated");
    });
  });

  describe("removeRule", () => {
    beforeEach(async () => {
      await policyEngine.initialize(mockConfig);
    });

    it("should remove existing rule", () => {
      const rule: PolicyRule = {
        id: "test_rule",
        name: "Test",
        description: "Test",
        type: PolicyRuleType.FILE_ACCESS,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [],
        actions: [],
      };

      policyEngine.addRule(rule);
      const removed = policyEngine.removeRule("test_rule");

      expect(removed).toBe(true);
      expect(policyEngine.getRules().some((r) => r.id === "test_rule")).toBe(false);
    });

    it("should return false for non-existent rule", () => {
      const removed = policyEngine.removeRule("nonexistent");

      expect(removed).toBe(false);
    });
  });

  describe("getRules", () => {
    beforeEach(async () => {
      await policyEngine.initialize(mockConfig);
    });

    it("should return all rules", () => {
      const rules = policyEngine.getRules();

      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBeGreaterThan(0);
    });

    it("should return a copy of rules array", () => {
      const rules1 = policyEngine.getRules();
      const rules2 = policyEngine.getRules();

      expect(rules1).not.toBe(rules2);
      expect(rules1).toEqual(rules2);
    });
  });

  describe("getEnabledRules", () => {
    beforeEach(async () => {
      await policyEngine.initialize(mockConfig);
    });

    it("should return only enabled rules", () => {
      const disabledRule: PolicyRule = {
        id: "disabled_rule",
        name: "Disabled",
        description: "Disabled",
        type: PolicyRuleType.FILE_ACCESS,
        severity: PolicySeverity.ERROR,
        enabled: false,
        conditions: [],
        actions: [],
      };

      policyEngine.addRule(disabledRule);

      const enabledRules = policyEngine.getEnabledRules();

      expect(enabledRules.every((r) => r.enabled)).toBe(true);
      expect(enabledRules.some((r) => r.id === "disabled_rule")).toBe(false);
    });
  });

  describe("setRuleEnabled", () => {
    beforeEach(async () => {
      await policyEngine.initialize(mockConfig);
    });

    it("should enable/disable existing rule", () => {
      const rule: PolicyRule = {
        id: "test_rule",
        name: "Test",
        description: "Test",
        type: PolicyRuleType.FILE_ACCESS,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [],
        actions: [],
      };

      policyEngine.addRule(rule);

      const disabled = policyEngine.setRuleEnabled("test_rule", false);
      expect(disabled).toBe(true);

      const foundRule = policyEngine.getRules().find((r) => r.id === "test_rule");
      expect(foundRule?.enabled).toBe(false);

      const enabled = policyEngine.setRuleEnabled("test_rule", true);
      expect(enabled).toBe(true);
      expect(foundRule?.enabled).toBe(true);
    });

    it("should return false for non-existent rule", () => {
      const result = policyEngine.setRuleEnabled("nonexistent", true);

      expect(result).toBe(false);
    });
  });

  describe("policy condition operators", () => {
    let policyContext: PolicyContext;

    beforeEach(async () => {
      await policyEngine.initialize(mockConfig);

      policyContext = {
        planId: "test-plan",
        stepId: "step-1",
        repository: {
          owner: "test",
          name: "repo",
          defaultBranch: "main",
        },
        user: {
          login: "test-user",
          type: "User",
        },
        files: [],
        environment: "test",
      };
    });

    it("should handle equals operator", async () => {
      const rule: PolicyRule = {
        id: "test_equals",
        name: "Test Equals",
        description: "Test",
        type: PolicyRuleType.USER_PERMISSIONS,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [
          {
            field: "user.type",
            operator: "equals",
            value: "Bot",
          },
        ],
        actions: [{ type: "block" }],
      };

      policyEngine.addRule(rule);
      policyContext.user.type = "Bot";

      const result = await policyEngine.evaluatePolicies(policyContext);

      expect(result.violations.some((v) => v.pattern === "test_equals")).toBe(true);
    });

    it("should handle not_equals operator", async () => {
      const rule: PolicyRule = {
        id: "test_not_equals",
        name: "Test Not Equals",
        description: "Test",
        type: PolicyRuleType.USER_PERMISSIONS,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [
          {
            field: "user.type",
            operator: "not_equals",
            value: "User",
          },
        ],
        actions: [{ type: "block" }],
      };

      policyEngine.addRule(rule);
      policyContext.user.type = "Bot";

      const result = await policyEngine.evaluatePolicies(policyContext);

      expect(result.violations.some((v) => v.pattern === "test_not_equals")).toBe(true);
    });

    it("should handle matches operator with glob patterns", async () => {
      const rule: PolicyRule = {
        id: "test_matches",
        name: "Test Matches",
        description: "Test",
        type: PolicyRuleType.FILE_ACCESS,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [
          {
            field: "files",
            operator: "matches",
            value: ["**/.env"],
          },
        ],
        actions: [{ type: "block" }],
      };

      policyEngine.addRule(rule);
      policyContext.files = ["config/.env"];

      const result = await policyEngine.evaluatePolicies(policyContext);

      expect(result.violations.some((v) => v.pattern === "test_matches")).toBe(true);
    });

    it("should handle not_matches operator", async () => {
      const rule: PolicyRule = {
        id: "test_not_matches",
        name: "Test Not Matches",
        description: "Test",
        type: PolicyRuleType.FILE_ACCESS,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [
          {
            field: "files",
            operator: "not_matches",
            value: ["src/**/*.ts"],
          },
        ],
        actions: [{ type: "block" }],
      };

      policyEngine.addRule(rule);
      policyContext.files = ["config/settings.json"];

      const result = await policyEngine.evaluatePolicies(policyContext);

      expect(result.violations.some((v) => v.pattern === "test_not_matches")).toBe(true);
    });

    it("should handle contains operator", async () => {
      const rule: PolicyRule = {
        id: "test_contains",
        name: "Test Contains",
        description: "Test",
        type: PolicyRuleType.COMMAND_EXECUTION,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [
          {
            field: "commands",
            operator: "contains",
            value: ["rm ", "delete"],
          },
        ],
        actions: [{ type: "block" }],
      };

      policyEngine.addRule(rule);
      policyContext.commands = ["rm file.txt"];

      const result = await policyEngine.evaluatePolicies(policyContext);

      expect(result.violations.some((v) => v.pattern === "test_contains")).toBe(true);
    });

    it("should handle not_contains operator", async () => {
      const rule: PolicyRule = {
        id: "test_not_contains",
        name: "Test Not Contains",
        description: "Test",
        type: PolicyRuleType.COMMAND_EXECUTION,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [
          {
            field: "commands",
            operator: "not_contains",
            value: ["git", "npm"],
          },
        ],
        actions: [{ type: "block" }],
      };

      policyEngine.addRule(rule);
      policyContext.commands = ["rm -rf /tmp/test"];

      const result = await policyEngine.evaluatePolicies(policyContext);

      expect(result.violations.some((v) => v.pattern === "test_not_contains")).toBe(true);
    });

    it("should handle greater_than operator", async () => {
      const rule: PolicyRule = {
        id: "test_greater_than",
        name: "Test Greater Than",
        description: "Test",
        type: PolicyRuleType.RESOURCE_USAGE,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [
          {
            field: "resourceUsage.timeout",
            operator: "greater_than",
            value: 3600,
          },
        ],
        actions: [{ type: "block" }],
      };

      policyEngine.addRule(rule);
      policyContext.resourceUsage = { timeout: 7200 };

      const result = await policyEngine.evaluatePolicies(policyContext);

      expect(result.violations.some((v) => v.pattern === "test_greater_than")).toBe(true);
    });

    it("should handle less_than operator", async () => {
      const rule: PolicyRule = {
        id: "test_less_than",
        name: "Test Less Than",
        description: "Test",
        type: PolicyRuleType.RESOURCE_USAGE,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [
          {
            field: "resourceUsage.memory",
            operator: "less_than",
            value: 1024,
          },
        ],
        actions: [{ type: "block" }],
      };

      policyEngine.addRule(rule);
      policyContext.resourceUsage = { memory: 512 };

      const result = await policyEngine.evaluatePolicies(policyContext);

      expect(result.violations.some((v) => v.pattern === "test_less_than")).toBe(true);
    });

    it("should handle invalid numbers in comparison operators", async () => {
      const rule: PolicyRule = {
        id: "test_invalid_number",
        name: "Test Invalid Number",
        description: "Test",
        type: PolicyRuleType.RESOURCE_USAGE,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [
          {
            field: "environment",
            operator: "greater_than",
            value: 100,
          },
        ],
        actions: [{ type: "block" }],
      };

      policyEngine.addRule(rule);

      const result = await policyEngine.evaluatePolicies(policyContext);

      // Should not violate because environment is not a number
      expect(result.violations.some((v) => v.pattern === "test_invalid_number")).toBe(false);
    });
  });
});

describe("createPolicyEngine", () => {
  it("should return policy engine instance", () => {
    const engine = createPolicyEngine();
    expect(engine).toBeInstanceOf(PolicyEngine);
  });

  it("should return the same singleton instance", () => {
    const engine1 = createPolicyEngine();
    const engine2 = createPolicyEngine();
    expect(engine1).toBe(engine2);
  });
});

describe("initializePolicyEngine", () => {
  let mockConfig: HachikoConfig;

  beforeEach(() => {
    // Reset engine
    const engine = PolicyEngine.getInstance();
    (engine as any).initialized = false;
    (engine as any).rules = [];

    mockConfig = {
      plans: { directory: "migrations/", extensions: [".md"] },
      agents: {},
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
  });

  it("should initialize and return policy engine", async () => {
    const engine = await initializePolicyEngine(mockConfig);

    expect(engine).toBeInstanceOf(PolicyEngine);
    expect((engine as any).initialized).toBe(true);
  });

  it("should load policy rules during initialization", async () => {
    const engine = await initializePolicyEngine(mockConfig);

    const rules = engine.getRules();
    expect(rules.length).toBeGreaterThan(0);
  });
});
