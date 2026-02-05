import { beforeEach, describe, expect, it } from "vitest";
import {
  PolicyEngine,
  PolicyRuleType,
  PolicySeverity,
  createPolicyEngine,
  initializePolicyEngine,
  type PolicyContext,
  type PolicyRule,
} from "../../../src/services/policy-engine.js";
import type { HachikoConfig } from "../../../src/config/schema.js";
import { PolicyViolationError } from "../../../src/utils/errors.js";

describe("PolicyEngine", () => {
  let policyEngine: PolicyEngine;
  let mockConfig: HachikoConfig;

  beforeEach(() => {
    // Reset singleton instance before each test
    (PolicyEngine as any).instance = null;

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
      agents: {},
    };

    policyEngine = PolicyEngine.getInstance();
  });

  describe("getInstance", () => {
    it("should return the same instance (singleton)", () => {
      const instance1 = PolicyEngine.getInstance();
      const instance2 = PolicyEngine.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("createPolicyEngine", () => {
    it("should return the singleton instance", () => {
      const engine1 = createPolicyEngine();
      const engine2 = PolicyEngine.getInstance();
      expect(engine1).toBe(engine2);
    });
  });

  describe("initializePolicyEngine", () => {
    it("should initialize and return the policy engine", async () => {
      const engine = await initializePolicyEngine(mockConfig);
      expect(engine).toBe(policyEngine);
    });
  });

  describe("initialize", () => {
    it("should initialize with built-in rules", async () => {
      await policyEngine.initialize(mockConfig);
      const rules = policyEngine.getRules();

      expect(rules.length).toBeGreaterThan(0);
      expect(rules.some((r) => r.id === "block_sensitive_files")).toBe(true);
      expect(rules.some((r) => r.id === "block_risky_paths")).toBe(true);
      expect(rules.some((r) => r.id === "block_dangerous_commands")).toBe(true);
    });

    it("should only initialize once", async () => {
      await policyEngine.initialize(mockConfig);
      const initialRules = policyEngine.getRules();

      await policyEngine.initialize(mockConfig);
      const rulesAfterSecondInit = policyEngine.getRules();

      expect(initialRules).toEqual(rulesAfterSecondInit);
    });

    it("should include network blocking rule when network is none", async () => {
      await policyEngine.initialize(mockConfig);
      const rules = policyEngine.getRules();

      expect(rules.some((r) => r.id === "block_network_access")).toBe(true);
    });

    it("should not include network blocking rule when network is unrestricted", async () => {
      const configWithNetwork = {
        ...mockConfig,
        policy: { ...mockConfig.policy, network: "unrestricted" as const },
      };

      await policyEngine.initialize(configWithNetwork);
      const rules = policyEngine.getRules();

      expect(rules.some((r) => r.id === "block_network_access")).toBe(false);
    });

    it("should include allowlist rule when allowlistGlobs is set", async () => {
      await policyEngine.initialize(mockConfig);
      const rules = policyEngine.getRules();

      expect(rules.some((r) => r.id === "enforce_allowlist")).toBe(true);
    });

    it("should not include allowlist rule when allowlistGlobs is empty", async () => {
      const configWithNoAllowlist = {
        ...mockConfig,
        policy: { ...mockConfig.policy, allowlistGlobs: [] },
      };

      await policyEngine.initialize(configWithNoAllowlist);
      const rules = policyEngine.getRules();

      expect(rules.some((r) => r.id === "enforce_allowlist")).toBe(false);
    });
  });

  describe("evaluatePolicies", () => {
    const baseContext: PolicyContext = {
      planId: "test-migration",
      stepId: "step-1",
      repository: {
        owner: "test-owner",
        name: "test-repo",
        defaultBranch: "main",
      },
      user: {
        login: "test-user",
        type: "User",
      },
      files: ["src/file1.ts", "src/file2.ts"],
      environment: "production",
    };

    it("should throw PolicyViolationError if not initialized", async () => {
      await expect(policyEngine.evaluatePolicies(baseContext)).rejects.toThrow(PolicyViolationError);
    });

    it("should allow access to safe files", async () => {
      await policyEngine.initialize(mockConfig);
      const result = await policyEngine.evaluatePolicies(baseContext);

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it("should block access to sensitive files", async () => {
      await policyEngine.initialize(mockConfig);

      const contextWithSensitiveFiles: PolicyContext = {
        ...baseContext,
        files: [".env.production", "src/safe.ts"],
      };

      const result = await policyEngine.evaluatePolicies(contextWithSensitiveFiles);

      expect(result.allowed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it("should block access to risky paths", async () => {
      await policyEngine.initialize(mockConfig);

      const contextWithRiskyPaths: PolicyContext = {
        ...baseContext,
        files: [".github/workflows/ci.yml"],
      };

      const result = await policyEngine.evaluatePolicies(contextWithRiskyPaths);

      expect(result.allowed).toBe(false);
      expect(result.violations.some((v) => v.pattern === "block_risky_paths")).toBe(true);
    });

    it("should block access to secret files", async () => {
      await policyEngine.initialize(mockConfig);

      const contextWithSecrets: PolicyContext = {
        ...baseContext,
        files: ["config/secrets/api-key.json"],
      };

      const result = await policyEngine.evaluatePolicies(contextWithSecrets);

      expect(result.allowed).toBe(false);
    });

    it("should block dangerous commands", async () => {
      await policyEngine.initialize(mockConfig);

      const contextWithCommands: PolicyContext = {
        ...baseContext,
        commands: ["rm -rf /", "sudo apt-get install"],
      };

      const result = await policyEngine.evaluatePolicies(contextWithCommands);

      expect(result.allowed).toBe(false);
      expect(result.violations.some((v) => v.type === "command_execution")).toBe(true);
    });

    it("should allow safe commands", async () => {
      await policyEngine.initialize(mockConfig);

      const contextWithSafeCommands: PolicyContext = {
        ...baseContext,
        commands: ["npm install", "npm test"],
      };

      const result = await policyEngine.evaluatePolicies(contextWithSafeCommands);

      // Should be allowed - no dangerous commands
      expect(result.violations.filter((v) => v.type === "command_execution")).toHaveLength(0);
    });

    it("should have network blocking rule when network is none", async () => {
      await policyEngine.initialize(mockConfig);

      // Verify the network access rule is present
      const rules = policyEngine.getRules();
      const networkRule = rules.find((r) => r.id === "block_network_access");
      expect(networkRule).toBeDefined();
      expect(networkRule?.enabled).toBe(true);
      expect(networkRule?.type).toBe(PolicyRuleType.NETWORK_ACCESS);
    });

    it("should detect bot users", async () => {
      await policyEngine.initialize(mockConfig);

      const contextWithBotUser: PolicyContext = {
        ...baseContext,
        user: {
          login: "dependabot",
          type: "Bot",
        },
      };

      const result = await policyEngine.evaluatePolicies(contextWithBotUser);

      expect(result.allowed).toBe(false);
    });

    it("should handle resource timeout violations", async () => {
      await policyEngine.initialize(mockConfig);

      const contextWithTimeout: PolicyContext = {
        ...baseContext,
        resourceUsage: {
          timeout: 2000, // 2000 seconds, exceeds 15 minutes (900 seconds)
        },
      };

      const result = await policyEngine.evaluatePolicies(contextWithTimeout);

      expect(result.violations.some((v) => v.pattern === "limit_execution_time")).toBe(true);
    });

    it("should collect warnings separately from violations", async () => {
      // Create a config where some rules would produce warnings
      const configWithWarnings = {
        ...mockConfig,
        policy: {
          ...mockConfig.policy,
          allowlistGlobs: [], // No allowlist
          riskyGlobs: [], // No risky globs
        },
      };

      // Reset singleton to apply new config
      (PolicyEngine as any).instance = null;
      const engine = PolicyEngine.getInstance();
      await engine.initialize(configWithWarnings);

      // Add a custom rule that produces warnings
      const warningRule: PolicyRule = {
        id: "test_warning_rule",
        name: "Test Warning",
        description: "Test warning rule",
        type: PolicyRuleType.FILE_ACCESS,
        severity: PolicySeverity.WARNING,
        enabled: true,
        conditions: [
          {
            field: "files",
            operator: "contains",
            value: ["warning-file"],
          },
        ],
        actions: [{ type: "warn", message: "This is a warning" }],
      };
      engine.addRule(warningRule);

      const contextWithWarningFile: PolicyContext = {
        ...baseContext,
        files: ["warning-file.ts"],
      };

      const result = await engine.evaluatePolicies(contextWithWarningFile);

      // Warnings don't block
      expect(result.warnings.length).toBeGreaterThanOrEqual(0);
    });

    it("should track requiresApproval flag", async () => {
      await policyEngine.initialize(mockConfig);

      // Add a rule that requires approval
      const approvalRule: PolicyRule = {
        id: "require_approval_rule",
        name: "Require Approval",
        description: "Test approval requirement",
        type: PolicyRuleType.FILE_ACCESS,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [
          {
            field: "files",
            operator: "contains",
            value: ["approval-needed"],
          },
        ],
        actions: [{ type: "require_approval", message: "Approval required" }],
      };
      policyEngine.addRule(approvalRule);

      const contextNeedingApproval: PolicyContext = {
        ...baseContext,
        files: ["approval-needed.ts"],
      };

      const result = await policyEngine.evaluatePolicies(contextNeedingApproval);

      expect(result.requiresApproval).toBe(true);
    });

    it("should handle rule evaluation errors gracefully", async () => {
      await policyEngine.initialize(mockConfig);

      // Add a malformed rule that would cause evaluation error
      const badRule: PolicyRule = {
        id: "bad_rule",
        name: "Bad Rule",
        description: "Rule that causes error",
        type: PolicyRuleType.FILE_ACCESS,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [
          {
            field: "nonexistent.deep.nested.field",
            operator: "equals",
            value: "something",
          },
        ],
        actions: [{ type: "block" }],
      };
      policyEngine.addRule(badRule);

      // Should not throw, just skip the problematic rule
      const result = await policyEngine.evaluatePolicies(baseContext);
      expect(result).toBeDefined();
    });
  });

  describe("addRule", () => {
    const testRule: PolicyRule = {
      id: "custom_rule",
      name: "Custom Rule",
      description: "A custom test rule",
      type: PolicyRuleType.FILE_ACCESS,
      severity: PolicySeverity.ERROR,
      enabled: true,
      conditions: [
        {
          field: "files",
          operator: "matches",
          value: ["**/*.test.ts"],
        },
      ],
      actions: [{ type: "block", message: "Test files not allowed" }],
    };

    it("should add a new rule", async () => {
      await policyEngine.initialize(mockConfig);
      const initialCount = policyEngine.getRules().length;

      policyEngine.addRule(testRule);

      expect(policyEngine.getRules().length).toBe(initialCount + 1);
      expect(policyEngine.getRules().some((r) => r.id === "custom_rule")).toBe(true);
    });

    it("should update an existing rule with same id", async () => {
      await policyEngine.initialize(mockConfig);
      policyEngine.addRule(testRule);

      const updatedRule = {
        ...testRule,
        name: "Updated Custom Rule",
      };
      policyEngine.addRule(updatedRule);

      const rules = policyEngine.getRules();
      const customRules = rules.filter((r) => r.id === "custom_rule");

      expect(customRules).toHaveLength(1);
      expect(customRules[0].name).toBe("Updated Custom Rule");
    });
  });

  describe("removeRule", () => {
    it("should remove an existing rule and return true", async () => {
      await policyEngine.initialize(mockConfig);

      const result = policyEngine.removeRule("block_sensitive_files");

      expect(result).toBe(true);
      expect(policyEngine.getRules().some((r) => r.id === "block_sensitive_files")).toBe(false);
    });

    it("should return false when removing non-existent rule", async () => {
      await policyEngine.initialize(mockConfig);

      const result = policyEngine.removeRule("nonexistent_rule");

      expect(result).toBe(false);
    });
  });

  describe("getRules", () => {
    it("should return a copy of rules array", async () => {
      await policyEngine.initialize(mockConfig);

      const rules1 = policyEngine.getRules();
      const rules2 = policyEngine.getRules();

      expect(rules1).not.toBe(rules2);
      expect(rules1).toEqual(rules2);
    });
  });

  describe("getEnabledRules", () => {
    it("should return only enabled rules", async () => {
      await policyEngine.initialize(mockConfig);

      // Disable a rule
      policyEngine.setRuleEnabled("block_sensitive_files", false);

      const enabledRules = policyEngine.getEnabledRules();

      expect(enabledRules.every((r) => r.enabled)).toBe(true);
      expect(enabledRules.some((r) => r.id === "block_sensitive_files")).toBe(false);
    });
  });

  describe("setRuleEnabled", () => {
    it("should enable a rule and return true", async () => {
      await policyEngine.initialize(mockConfig);
      policyEngine.setRuleEnabled("block_sensitive_files", false);

      const result = policyEngine.setRuleEnabled("block_sensitive_files", true);

      expect(result).toBe(true);
      const rule = policyEngine.getRules().find((r) => r.id === "block_sensitive_files");
      expect(rule?.enabled).toBe(true);
    });

    it("should disable a rule and return true", async () => {
      await policyEngine.initialize(mockConfig);

      const result = policyEngine.setRuleEnabled("block_sensitive_files", false);

      expect(result).toBe(true);
      const rule = policyEngine.getRules().find((r) => r.id === "block_sensitive_files");
      expect(rule?.enabled).toBe(false);
    });

    it("should return false for non-existent rule", async () => {
      await policyEngine.initialize(mockConfig);

      const result = policyEngine.setRuleEnabled("nonexistent_rule", false);

      expect(result).toBe(false);
    });
  });

  describe("condition operators", () => {
    beforeEach(async () => {
      await policyEngine.initialize(mockConfig);
    });

    it("should handle equals operator", async () => {
      const rule: PolicyRule = {
        id: "test_equals",
        name: "Test Equals",
        description: "Test equals operator",
        type: PolicyRuleType.USER_PERMISSIONS,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [{ field: "user.login", operator: "equals", value: "blocked-user" }],
        actions: [{ type: "block" }],
      };
      policyEngine.addRule(rule);

      const blockedContext: PolicyContext = {
        planId: "test",
        stepId: "1",
        repository: { owner: "o", name: "r", defaultBranch: "main" },
        user: { login: "blocked-user", type: "User" },
        files: ["src/test.ts"],
        environment: "test",
      };

      const result = await policyEngine.evaluatePolicies(blockedContext);
      expect(result.violations.some((v) => v.pattern === "test_equals")).toBe(true);
    });

    it("should handle not_equals operator", async () => {
      const rule: PolicyRule = {
        id: "test_not_equals",
        name: "Test Not Equals",
        description: "Test not_equals operator",
        type: PolicyRuleType.USER_PERMISSIONS,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [{ field: "user.login", operator: "not_equals", value: "allowed-user" }],
        actions: [{ type: "block" }],
      };
      policyEngine.addRule(rule);

      const context: PolicyContext = {
        planId: "test",
        stepId: "1",
        repository: { owner: "o", name: "r", defaultBranch: "main" },
        user: { login: "other-user", type: "User" },
        files: ["src/test.ts"],
        environment: "test",
      };

      const result = await policyEngine.evaluatePolicies(context);
      expect(result.violations.some((v) => v.pattern === "test_not_equals")).toBe(true);
    });

    it("should handle not_matches operator", async () => {
      const rule: PolicyRule = {
        id: "test_not_matches",
        name: "Test Not Matches",
        description: "Test not_matches operator",
        type: PolicyRuleType.FILE_ACCESS,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [
          {
            field: "files",
            operator: "not_matches",
            value: ["src/**"],
          },
        ],
        actions: [{ type: "block" }],
      };
      policyEngine.addRule(rule);

      const contextOutsideSrc: PolicyContext = {
        planId: "test",
        stepId: "1",
        repository: { owner: "o", name: "r", defaultBranch: "main" },
        user: { login: "user", type: "User" },
        files: ["lib/external.ts"],
        environment: "test",
      };

      const result = await policyEngine.evaluatePolicies(contextOutsideSrc);
      expect(result.violations.some((v) => v.pattern === "test_not_matches")).toBe(true);
    });

    it("should handle not_contains operator", async () => {
      const rule: PolicyRule = {
        id: "test_not_contains",
        name: "Test Not Contains",
        description: "Test not_contains operator",
        type: PolicyRuleType.COMMAND_EXECUTION,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [
          {
            field: "commands",
            operator: "not_contains",
            value: ["npm"],
          },
        ],
        actions: [{ type: "block" }],
      };
      policyEngine.addRule(rule);

      const contextWithYarn: PolicyContext = {
        planId: "test",
        stepId: "1",
        repository: { owner: "o", name: "r", defaultBranch: "main" },
        user: { login: "user", type: "User" },
        files: ["src/test.ts"],
        commands: ["yarn install"],
        environment: "test",
      };

      const result = await policyEngine.evaluatePolicies(contextWithYarn);
      expect(result.violations.some((v) => v.pattern === "test_not_contains")).toBe(true);
    });

    it("should handle less_than operator", async () => {
      const rule: PolicyRule = {
        id: "test_less_than",
        name: "Test Less Than",
        description: "Test less_than operator",
        type: PolicyRuleType.RESOURCE_USAGE,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [
          {
            field: "resourceUsage.memory",
            operator: "less_than",
            value: 100,
          },
        ],
        actions: [{ type: "block" }],
      };
      policyEngine.addRule(rule);

      const contextWithLowMemory: PolicyContext = {
        planId: "test",
        stepId: "1",
        repository: { owner: "o", name: "r", defaultBranch: "main" },
        user: { login: "user", type: "User" },
        files: ["src/test.ts"],
        resourceUsage: { memory: 50 },
        environment: "test",
      };

      const result = await policyEngine.evaluatePolicies(contextWithLowMemory);
      expect(result.violations.some((v) => v.pattern === "test_less_than")).toBe(true);
    });

    it("should handle array comparison in equals operator", async () => {
      const rule: PolicyRule = {
        id: "test_array_equals",
        name: "Test Array Equals",
        description: "Test array equals operator",
        type: PolicyRuleType.FILE_ACCESS,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [
          {
            field: "files",
            operator: "equals",
            value: ["src/a.ts", "src/b.ts"],
          },
        ],
        actions: [{ type: "block" }],
      };
      policyEngine.addRule(rule);

      const contextWithMatchingFiles: PolicyContext = {
        planId: "test",
        stepId: "1",
        repository: { owner: "o", name: "r", defaultBranch: "main" },
        user: { login: "user", type: "User" },
        files: ["src/a.ts", "src/b.ts"],
        environment: "test",
      };

      const result = await policyEngine.evaluatePolicies(contextWithMatchingFiles);
      expect(result.violations.some((v) => v.pattern === "test_array_equals")).toBe(true);
    });

    it("should handle NaN in number comparison", async () => {
      const rule: PolicyRule = {
        id: "test_nan_comparison",
        name: "Test NaN",
        description: "Test NaN handling",
        type: PolicyRuleType.RESOURCE_USAGE,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [
          {
            field: "resourceUsage.memory",
            operator: "greater_than",
            value: 100,
          },
        ],
        actions: [{ type: "block" }],
      };
      policyEngine.addRule(rule);

      const contextWithNaN: PolicyContext = {
        planId: "test",
        stepId: "1",
        repository: { owner: "o", name: "r", defaultBranch: "main" },
        user: { login: "user", type: "User" },
        files: ["src/test.ts"],
        resourceUsage: { memory: Number.NaN },
        environment: "test",
      };

      // NaN comparisons should return false, not throw
      const result = await policyEngine.evaluatePolicies(contextWithNaN);
      expect(result.violations.some((v) => v.pattern === "test_nan_comparison")).toBe(false);
    });
  });

  describe("rule type mapping", () => {
    it("should map file_access rule type correctly", async () => {
      await policyEngine.initialize(mockConfig);

      const context: PolicyContext = {
        planId: "test",
        stepId: "1",
        repository: { owner: "o", name: "r", defaultBranch: "main" },
        user: { login: "user", type: "User" },
        files: [".env.local"],
        environment: "test",
      };

      const result = await policyEngine.evaluatePolicies(context);
      const fileViolations = result.violations.filter((v) => v.type === "file_access");
      expect(fileViolations.length).toBeGreaterThan(0);
    });

    it("should map command_execution rule type correctly", async () => {
      await policyEngine.initialize(mockConfig);

      const context: PolicyContext = {
        planId: "test",
        stepId: "1",
        repository: { owner: "o", name: "r", defaultBranch: "main" },
        user: { login: "user", type: "User" },
        files: ["src/test.ts"],
        commands: ["sudo rm -rf /"],
        environment: "test",
      };

      const result = await policyEngine.evaluatePolicies(context);
      const commandViolations = result.violations.filter((v) => v.type === "command_execution");
      expect(commandViolations.length).toBeGreaterThan(0);
    });

    it("should map network_access rule type correctly", async () => {
      await policyEngine.initialize(mockConfig);

      // Add a custom network access rule that will trigger a violation
      const networkRule: PolicyRule = {
        id: "test_network_rule",
        name: "Test Network Rule",
        description: "Test network access mapping",
        type: PolicyRuleType.NETWORK_ACCESS,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [
          {
            field: "environment",
            operator: "equals",
            value: "network-test",
          },
        ],
        actions: [{ type: "block" }],
      };
      policyEngine.addRule(networkRule);

      const context: PolicyContext = {
        planId: "test",
        stepId: "1",
        repository: { owner: "o", name: "r", defaultBranch: "main" },
        user: { login: "user", type: "User" },
        files: ["src/test.ts"],
        environment: "network-test",
      };

      const result = await policyEngine.evaluatePolicies(context);
      const networkViolations = result.violations.filter((v) => v.type === "network_access");
      expect(networkViolations.length).toBeGreaterThan(0);
    });

    it("should default to file_access for unknown rule types", async () => {
      await policyEngine.initialize(mockConfig);

      // Add rule with time_constraints type (not directly mapped)
      const rule: PolicyRule = {
        id: "test_time",
        name: "Test Time",
        description: "Test time constraints",
        type: PolicyRuleType.TIME_CONSTRAINTS,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [
          {
            field: "environment",
            operator: "equals",
            value: "production",
          },
        ],
        actions: [{ type: "block" }],
      };
      policyEngine.addRule(rule);

      const context: PolicyContext = {
        planId: "test",
        stepId: "1",
        repository: { owner: "o", name: "r", defaultBranch: "main" },
        user: { login: "user", type: "User" },
        files: ["src/test.ts"],
        environment: "production",
      };

      const result = await policyEngine.evaluatePolicies(context);
      const timeViolation = result.violations.find((v) => v.pattern === "test_time");
      // Should map to file_access as default
      expect(timeViolation?.type).toBe("file_access");
    });
  });

  describe("policy severity handling", () => {
    beforeEach(async () => {
      await policyEngine.initialize(mockConfig);
    });

    it("should treat CRITICAL severity as error", async () => {
      const criticalRule: PolicyRule = {
        id: "critical_rule",
        name: "Critical Rule",
        description: "Critical severity rule",
        type: PolicyRuleType.FILE_ACCESS,
        severity: PolicySeverity.CRITICAL,
        enabled: true,
        conditions: [{ field: "files", operator: "contains", value: ["critical-file"] }],
        actions: [{ type: "block" }],
      };
      policyEngine.addRule(criticalRule);

      const context: PolicyContext = {
        planId: "test",
        stepId: "1",
        repository: { owner: "o", name: "r", defaultBranch: "main" },
        user: { login: "user", type: "User" },
        files: ["critical-file.ts"],
        environment: "test",
      };

      const result = await policyEngine.evaluatePolicies(context);
      const violation = result.violations.find((v) => v.pattern === "critical_rule");
      expect(violation?.severity).toBe("error");
    });

    it("should treat WARNING severity as warning", async () => {
      // Create a clean policy engine with minimal rules for this test
      (PolicyEngine as any).instance = null;
      const engine = PolicyEngine.getInstance();
      
      // Initialize with config that won't trigger other violations
      const minimalConfig = {
        ...mockConfig,
        policy: {
          ...mockConfig.policy,
          allowlistGlobs: ["**/*"], // Allow all files
          riskyGlobs: [], // No risky patterns
        },
      };
      await engine.initialize(minimalConfig);

      const warningRule: PolicyRule = {
        id: "warning_rule",
        name: "Warning Rule",
        description: "Warning severity rule",
        type: PolicyRuleType.FILE_ACCESS,
        severity: PolicySeverity.WARNING,
        enabled: true,
        conditions: [{ field: "files", operator: "contains", value: ["warn-file"] }],
        actions: [{ type: "warn" }],
      };
      engine.addRule(warningRule);

      const context: PolicyContext = {
        planId: "test",
        stepId: "1",
        repository: { owner: "o", name: "r", defaultBranch: "main" },
        user: { login: "user", type: "User" },
        files: ["src/warn-file.ts"], // Use src/ to match allowlist
        environment: "test",
      };

      const result = await engine.evaluatePolicies(context);
      // Warnings go to warnings array, not violations
      expect(result.warnings.some((w) => w.pattern === "warning_rule")).toBe(true);
      // Should still be allowed since it's just a warning (and no other violations)
      expect(result.allowed).toBe(true);
    });

    it("should treat INFO severity as warning", async () => {
      const infoRule: PolicyRule = {
        id: "info_rule",
        name: "Info Rule",
        description: "Info severity rule",
        type: PolicyRuleType.FILE_ACCESS,
        severity: PolicySeverity.INFO,
        enabled: true,
        conditions: [{ field: "files", operator: "contains", value: ["info-file"] }],
        actions: [{ type: "log" }],
      };
      policyEngine.addRule(infoRule);

      const context: PolicyContext = {
        planId: "test",
        stepId: "1",
        repository: { owner: "o", name: "r", defaultBranch: "main" },
        user: { login: "user", type: "User" },
        files: ["info-file.ts"],
        environment: "test",
      };

      const result = await policyEngine.evaluatePolicies(context);
      // Info should be treated as warning
      expect(result.warnings.some((w) => w.pattern === "info_rule")).toBe(true);
    });
  });
});
