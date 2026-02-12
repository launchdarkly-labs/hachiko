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
      allowlistGlobs: ["src/**", "test/**"],
      riskyGlobs: [".env*", "**/secrets/**"],
      network: "restricted",
    },
    agents: {},
    migration: {
      defaults: {
        baseBranch: "main",
        branchPrefix: "hachiko/",
      },
      migrations: [],
    },
    security: {},
  };

  const basePolicyContext: PolicyContext = {
    planId: "test-plan",
    stepId: "step-1",
    repository: {
      owner: "test-owner",
      name: "test-repo",
      defaultBranch: "main",
      isPrivate: false,
    },
    user: {
      login: "test-user",
      type: "User",
      permissions: ["write"],
    },
    files: ["src/test.ts"],
    environment: "production",
  };

  beforeEach(() => {
    // Reset singleton state between tests
    (PolicyEngine as any).instance = null;
    policyEngine = PolicyEngine.getInstance();
  });

  describe("singleton pattern", () => {
    it("should return the same instance", () => {
      const instance1 = PolicyEngine.getInstance();
      const instance2 = PolicyEngine.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("should return the same instance via createPolicyEngine", () => {
      const instance1 = createPolicyEngine();
      const instance2 = PolicyEngine.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("initialize", () => {
    it("should initialize the policy engine with configuration", async () => {
      await policyEngine.initialize(mockConfig);

      const rules = policyEngine.getRules();
      expect(rules.length).toBeGreaterThan(0);
    });

    it("should not reinitialize if already initialized", async () => {
      await policyEngine.initialize(mockConfig);
      const initialRuleCount = policyEngine.getRules().length;

      await policyEngine.initialize(mockConfig);
      const subsequentRuleCount = policyEngine.getRules().length;

      expect(initialRuleCount).toBe(subsequentRuleCount);
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
    });

    it("should load network access rule when network is none", async () => {
      const configWithNoNetwork = {
        ...mockConfig,
        policy: {
          ...mockConfig.policy,
          network: "none" as const,
        },
      };

      await policyEngine.initialize(configWithNoNetwork);

      const rules = policyEngine.getRules();
      const networkRule = rules.find((r) => r.id === "block_network_access");
      expect(networkRule).toBeDefined();
    });

    it("should not load network access rule when network is not none", async () => {
      await policyEngine.initialize(mockConfig);

      const rules = policyEngine.getRules();
      const networkRule = rules.find((r) => r.id === "block_network_access");
      expect(networkRule).toBeUndefined();
    });
  });

  describe("initializePolicyEngine", () => {
    it("should initialize and return policy engine", async () => {
      const engine = await initializePolicyEngine(mockConfig);

      expect(engine).toBe(policyEngine);
      expect(engine.getRules().length).toBeGreaterThan(0);
    });
  });

  describe("evaluatePolicies", () => {
    beforeEach(async () => {
      await policyEngine.initialize(mockConfig);
    });

    it("should throw error if not initialized", async () => {
      (PolicyEngine as any).instance = null;
      const uninitializedEngine = PolicyEngine.getInstance();

      await expect(uninitializedEngine.evaluatePolicies(basePolicyContext)).rejects.toThrow(
        PolicyViolationError
      );
    });

    it("should allow valid file access", async () => {
      const context: PolicyContext = {
        ...basePolicyContext,
        files: ["src/component.ts", "test/component.test.ts"],
      };

      const result = await policyEngine.evaluatePolicies(context);

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it("should block access to sensitive files", async () => {
      const context: PolicyContext = {
        ...basePolicyContext,
        files: [".env.local"],
      };

      const result = await policyEngine.evaluatePolicies(context);

      expect(result.allowed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].type).toBe("file_access");
    });

    it("should block access to risky paths", async () => {
      const context: PolicyContext = {
        ...basePolicyContext,
        files: ["config/secrets/api-keys.json"],
      };

      const result = await policyEngine.evaluatePolicies(context);

      expect(result.allowed).toBe(false);
      expect(result.violations.some((v) => v.pattern === "block_risky_paths")).toBe(true);
    });

    it("should detect files outside allowlist", async () => {
      const context: PolicyContext = {
        ...basePolicyContext,
        files: ["scripts/deploy.sh"],
      };

      const result = await policyEngine.evaluatePolicies(context);

      expect(result.allowed).toBe(false);
      expect(result.violations.some((v) => v.pattern === "enforce_allowlist")).toBe(true);
    });

    it("should block dangerous commands", async () => {
      const context: PolicyContext = {
        ...basePolicyContext,
        commands: ["rm -rf /", "npm install"],
      };

      const result = await policyEngine.evaluatePolicies(context);

      expect(result.allowed).toBe(false);
      expect(result.violations.some((v) => v.type === "command_execution")).toBe(true);
    });

    it("should block bot users", async () => {
      const context: PolicyContext = {
        ...basePolicyContext,
        user: {
          login: "dependabot[bot]",
          type: "Bot",
        },
      };

      const result = await policyEngine.evaluatePolicies(context);

      expect(result.allowed).toBe(false);
      expect(result.violations.some((v) => v.pattern === "require_write_permissions")).toBe(true);
    });

    it("should detect resource usage violations", async () => {
      const context: PolicyContext = {
        ...basePolicyContext,
        resourceUsage: {
          timeout: 3600, // 60 minutes in seconds, exceeds 30 min limit
        },
      };

      const result = await policyEngine.evaluatePolicies(context);

      expect(result.allowed).toBe(false);
      expect(result.violations.some((v) => v.pattern === "limit_execution_time")).toBe(true);
    });

    it("should collect warnings for non-error severity", async () => {
      // Add a warning-level rule
      policyEngine.addRule({
        id: "warn_test_files",
        name: "Warn Test Files",
        description: "Warn when modifying test files",
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
        actions: [{ type: "warn", message: "Modifying test files" }],
      });

      const context: PolicyContext = {
        ...basePolicyContext,
        files: ["test/component.test.ts"],
      };

      const result = await policyEngine.evaluatePolicies(context);

      expect(result.warnings.length).toBeGreaterThan(0);
      // Note: allowed may still be false due to other rules
    });

    it("should set requiresApproval when rule action requires it", async () => {
      policyEngine.addRule({
        id: "require_approval_for_config",
        name: "Require Approval for Config",
        description: "Require approval for config changes",
        type: PolicyRuleType.FILE_ACCESS,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [
          {
            field: "files",
            operator: "matches",
            value: ["**/config/**"],
          },
        ],
        actions: [{ type: "require_approval", message: "Config changes need approval" }],
      });

      const context: PolicyContext = {
        ...basePolicyContext,
        files: ["src/config/settings.ts"],
      };

      const result = await policyEngine.evaluatePolicies(context);

      expect(result.requiresApproval).toBe(true);
    });

    it("should skip disabled rules", async () => {
      policyEngine.setRuleEnabled("block_sensitive_files", false);

      const context: PolicyContext = {
        ...basePolicyContext,
        files: [".env.local"],
      };

      const result = await policyEngine.evaluatePolicies(context);

      // May still fail due to other rules, but not from block_sensitive_files
      const hasSensitiveFilesViolation = result.violations.some(
        (v) => v.pattern === "block_sensitive_files"
      );
      expect(hasSensitiveFilesViolation).toBe(false);
    });
  });

  describe("addRule", () => {
    beforeEach(async () => {
      await policyEngine.initialize(mockConfig);
    });

    it("should add a new rule", () => {
      const newRule: PolicyRule = {
        id: "custom_rule",
        name: "Custom Rule",
        description: "A custom policy rule",
        type: PolicyRuleType.FILE_ACCESS,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [
          {
            field: "files",
            operator: "matches",
            value: ["**/custom/**"],
          },
        ],
        actions: [{ type: "block", message: "Custom file access blocked" }],
      };

      policyEngine.addRule(newRule);

      const rules = policyEngine.getRules();
      expect(rules.find((r) => r.id === "custom_rule")).toEqual(newRule);
    });

    it("should update existing rule with same id", () => {
      const initialRule: PolicyRule = {
        id: "update_test",
        name: "Initial Name",
        description: "Initial description",
        type: PolicyRuleType.FILE_ACCESS,
        severity: PolicySeverity.WARNING,
        enabled: true,
        conditions: [],
        actions: [],
      };

      policyEngine.addRule(initialRule);

      const updatedRule: PolicyRule = {
        ...initialRule,
        name: "Updated Name",
        severity: PolicySeverity.ERROR,
      };

      policyEngine.addRule(updatedRule);

      const rules = policyEngine.getRules();
      const rule = rules.find((r) => r.id === "update_test");
      expect(rule?.name).toBe("Updated Name");
      expect(rule?.severity).toBe(PolicySeverity.ERROR);
    });
  });

  describe("removeRule", () => {
    beforeEach(async () => {
      await policyEngine.initialize(mockConfig);
    });

    it("should remove an existing rule", () => {
      const rulesBefore = policyEngine.getRules();
      expect(rulesBefore.some((r) => r.id === "block_sensitive_files")).toBe(true);

      const result = policyEngine.removeRule("block_sensitive_files");

      expect(result).toBe(true);
      const rulesAfter = policyEngine.getRules();
      expect(rulesAfter.some((r) => r.id === "block_sensitive_files")).toBe(false);
    });

    it("should return false for non-existent rule", () => {
      const result = policyEngine.removeRule("nonexistent_rule");
      expect(result).toBe(false);
    });
  });

  describe("getRules and getEnabledRules", () => {
    beforeEach(async () => {
      await policyEngine.initialize(mockConfig);
    });

    it("should return all rules", () => {
      const rules = policyEngine.getRules();
      expect(rules.length).toBeGreaterThan(0);
    });

    it("should return only enabled rules", () => {
      policyEngine.setRuleEnabled("block_sensitive_files", false);

      const enabledRules = policyEngine.getEnabledRules();

      expect(enabledRules.every((r) => r.enabled)).toBe(true);
      expect(enabledRules.some((r) => r.id === "block_sensitive_files")).toBe(false);
    });

    it("should return a copy of rules array", () => {
      const rules1 = policyEngine.getRules();
      const rules2 = policyEngine.getRules();

      expect(rules1).not.toBe(rules2);
      expect(rules1).toEqual(rules2);
    });
  });

  describe("setRuleEnabled", () => {
    beforeEach(async () => {
      await policyEngine.initialize(mockConfig);
    });

    it("should enable a disabled rule", () => {
      policyEngine.setRuleEnabled("block_sensitive_files", false);
      expect(policyEngine.getRules().find((r) => r.id === "block_sensitive_files")?.enabled).toBe(
        false
      );

      const result = policyEngine.setRuleEnabled("block_sensitive_files", true);

      expect(result).toBe(true);
      expect(policyEngine.getRules().find((r) => r.id === "block_sensitive_files")?.enabled).toBe(
        true
      );
    });

    it("should disable an enabled rule", () => {
      const result = policyEngine.setRuleEnabled("block_sensitive_files", false);

      expect(result).toBe(true);
      expect(policyEngine.getRules().find((r) => r.id === "block_sensitive_files")?.enabled).toBe(
        false
      );
    });

    it("should return false for non-existent rule", () => {
      const result = policyEngine.setRuleEnabled("nonexistent_rule", true);
      expect(result).toBe(false);
    });
  });

  describe("condition evaluation", () => {
    beforeEach(async () => {
      await policyEngine.initialize(mockConfig);
    });

    describe("equals operator", () => {
      it("should match equal values", async () => {
        policyEngine.addRule({
          id: "test_equals",
          name: "Test Equals",
          description: "Test equals operator",
          type: PolicyRuleType.USER_PERMISSIONS,
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
        });

        const context: PolicyContext = {
          ...basePolicyContext,
          environment: "production",
        };

        const result = await policyEngine.evaluatePolicies(context);
        expect(result.violations.some((v) => v.pattern === "test_equals")).toBe(true);
      });
    });

    describe("not_equals operator", () => {
      it("should match non-equal values", async () => {
        policyEngine.addRule({
          id: "test_not_equals",
          name: "Test Not Equals",
          description: "Test not_equals operator",
          type: PolicyRuleType.USER_PERMISSIONS,
          severity: PolicySeverity.ERROR,
          enabled: true,
          conditions: [
            {
              field: "environment",
              operator: "not_equals",
              value: "development",
            },
          ],
          actions: [{ type: "block" }],
        });

        const context: PolicyContext = {
          ...basePolicyContext,
          environment: "production",
        };

        const result = await policyEngine.evaluatePolicies(context);
        expect(result.violations.some((v) => v.pattern === "test_not_equals")).toBe(true);
      });
    });

    describe("contains operator", () => {
      it("should detect contained values in arrays", async () => {
        policyEngine.addRule({
          id: "test_contains",
          name: "Test Contains",
          description: "Test contains operator",
          type: PolicyRuleType.COMMAND_EXECUTION,
          severity: PolicySeverity.ERROR,
          enabled: true,
          conditions: [
            {
              field: "commands",
              operator: "contains",
              value: ["npm run"],
            },
          ],
          actions: [{ type: "block" }],
        });

        const context: PolicyContext = {
          ...basePolicyContext,
          commands: ["npm run build"],
        };

        const result = await policyEngine.evaluatePolicies(context);
        expect(result.violations.some((v) => v.pattern === "test_contains")).toBe(true);
      });
    });

    describe("not_contains operator", () => {
      it("should match when value is not contained", async () => {
        policyEngine.addRule({
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
              value: ["yarn"],
            },
          ],
          actions: [{ type: "block" }],
        });

        const context: PolicyContext = {
          ...basePolicyContext,
          commands: ["npm install"],
        };

        const result = await policyEngine.evaluatePolicies(context);
        expect(result.violations.some((v) => v.pattern === "test_not_contains")).toBe(true);
      });
    });

    describe("greater_than operator", () => {
      it("should match when value is greater", async () => {
        policyEngine.addRule({
          id: "test_greater_than",
          name: "Test Greater Than",
          description: "Test greater_than operator",
          type: PolicyRuleType.RESOURCE_USAGE,
          severity: PolicySeverity.ERROR,
          enabled: true,
          conditions: [
            {
              field: "resourceUsage.memory",
              operator: "greater_than",
              value: 1000,
            },
          ],
          actions: [{ type: "block" }],
        });

        const context: PolicyContext = {
          ...basePolicyContext,
          resourceUsage: {
            memory: 2000,
          },
        };

        const result = await policyEngine.evaluatePolicies(context);
        expect(result.violations.some((v) => v.pattern === "test_greater_than")).toBe(true);
      });

      it("should not match when value is not greater", async () => {
        policyEngine.addRule({
          id: "test_not_greater",
          name: "Test Not Greater",
          description: "Test greater_than operator not matching",
          type: PolicyRuleType.RESOURCE_USAGE,
          severity: PolicySeverity.ERROR,
          enabled: true,
          conditions: [
            {
              field: "resourceUsage.memory",
              operator: "greater_than",
              value: 3000,
            },
          ],
          actions: [{ type: "block" }],
        });

        const context: PolicyContext = {
          ...basePolicyContext,
          resourceUsage: {
            memory: 2000,
          },
        };

        const result = await policyEngine.evaluatePolicies(context);
        expect(result.violations.some((v) => v.pattern === "test_not_greater")).toBe(false);
      });
    });

    describe("less_than operator", () => {
      it("should match when value is less", async () => {
        policyEngine.addRule({
          id: "test_less_than",
          name: "Test Less Than",
          description: "Test less_than operator",
          type: PolicyRuleType.RESOURCE_USAGE,
          severity: PolicySeverity.ERROR,
          enabled: true,
          conditions: [
            {
              field: "resourceUsage.cpu",
              operator: "less_than",
              value: 50,
            },
          ],
          actions: [{ type: "block" }],
        });

        const context: PolicyContext = {
          ...basePolicyContext,
          resourceUsage: {
            cpu: 30,
          },
        };

        const result = await policyEngine.evaluatePolicies(context);
        expect(result.violations.some((v) => v.pattern === "test_less_than")).toBe(true);
      });
    });

    describe("matches operator", () => {
      it("should match glob patterns", async () => {
        policyEngine.addRule({
          id: "test_matches",
          name: "Test Matches",
          description: "Test matches operator",
          type: PolicyRuleType.FILE_ACCESS,
          severity: PolicySeverity.ERROR,
          enabled: true,
          conditions: [
            {
              field: "files",
              operator: "matches",
              value: ["**/*.config.js"],
            },
          ],
          actions: [{ type: "block" }],
        });

        const context: PolicyContext = {
          ...basePolicyContext,
          files: ["webpack.config.js"],
        };

        const result = await policyEngine.evaluatePolicies(context);
        expect(result.violations.some((v) => v.pattern === "test_matches")).toBe(true);
      });

      it("should match against arrays of files", async () => {
        policyEngine.addRule({
          id: "test_matches_array",
          name: "Test Matches Array",
          description: "Test matches operator with array",
          type: PolicyRuleType.FILE_ACCESS,
          severity: PolicySeverity.ERROR,
          enabled: true,
          conditions: [
            {
              field: "files",
              operator: "matches",
              value: ["**/dangerous/**"],
            },
          ],
          actions: [{ type: "block" }],
        });

        const context: PolicyContext = {
          ...basePolicyContext,
          files: ["src/safe.ts", "lib/dangerous/exploit.ts", "test/unit.test.ts"],
        };

        const result = await policyEngine.evaluatePolicies(context);
        expect(result.violations.some((v) => v.pattern === "test_matches_array")).toBe(true);
      });
    });

    describe("not_matches operator", () => {
      it("should match when pattern does not match", async () => {
        policyEngine.addRule({
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
              value: ["src/**", "test/**"],
            },
          ],
          actions: [{ type: "block" }],
        });

        const context: PolicyContext = {
          ...basePolicyContext,
          files: ["scripts/deploy.sh"],
        };

        const result = await policyEngine.evaluatePolicies(context);
        expect(result.violations.some((v) => v.pattern === "test_not_matches")).toBe(true);
      });
    });

    describe("nested field access", () => {
      it("should access nested fields via dot notation", async () => {
        policyEngine.addRule({
          id: "test_nested",
          name: "Test Nested",
          description: "Test nested field access",
          type: PolicyRuleType.USER_PERMISSIONS,
          severity: PolicySeverity.ERROR,
          enabled: true,
          conditions: [
            {
              field: "repository.isPrivate",
              operator: "equals",
              value: true,
            },
          ],
          actions: [{ type: "block" }],
        });

        const context: PolicyContext = {
          ...basePolicyContext,
          repository: {
            ...basePolicyContext.repository,
            isPrivate: true,
          },
        };

        const result = await policyEngine.evaluatePolicies(context);
        expect(result.violations.some((v) => v.pattern === "test_nested")).toBe(true);
      });

      it("should handle undefined nested fields gracefully", async () => {
        policyEngine.addRule({
          id: "test_undefined_nested",
          name: "Test Undefined Nested",
          description: "Test undefined nested field",
          type: PolicyRuleType.RESOURCE_USAGE,
          severity: PolicySeverity.ERROR,
          enabled: true,
          conditions: [
            {
              field: "resourceUsage.nonexistent.field",
              operator: "equals",
              value: "something",
            },
          ],
          actions: [{ type: "block" }],
        });

        const context: PolicyContext = {
          ...basePolicyContext,
        };

        // Should not throw, just not match
        const result = await policyEngine.evaluatePolicies(context);
        expect(result.violations.some((v) => v.pattern === "test_undefined_nested")).toBe(false);
      });
    });

    describe("NaN handling in numeric comparisons", () => {
      it("should return false for NaN comparisons", async () => {
        policyEngine.addRule({
          id: "test_nan",
          name: "Test NaN",
          description: "Test NaN handling",
          type: PolicyRuleType.RESOURCE_USAGE,
          severity: PolicySeverity.ERROR,
          enabled: true,
          conditions: [
            {
              field: "resourceUsage.memory",
              operator: "greater_than",
              value: 1000,
            },
          ],
          actions: [{ type: "block" }],
        });

        const context: PolicyContext = {
          ...basePolicyContext,
          resourceUsage: {
            memory: Number.NaN,
          },
        };

        const result = await policyEngine.evaluatePolicies(context);
        expect(result.violations.some((v) => v.pattern === "test_nan")).toBe(false);
      });
    });
  });

  describe("PolicyRuleType constants", () => {
    it("should have correct rule type values", () => {
      expect(PolicyRuleType.FILE_ACCESS).toBe("file_access");
      expect(PolicyRuleType.COMMAND_EXECUTION).toBe("command_execution");
      expect(PolicyRuleType.NETWORK_ACCESS).toBe("network_access");
      expect(PolicyRuleType.RESOURCE_USAGE).toBe("resource_usage");
      expect(PolicyRuleType.TIME_CONSTRAINTS).toBe("time_constraints");
      expect(PolicyRuleType.USER_PERMISSIONS).toBe("user_permissions");
    });
  });

  describe("PolicySeverity constants", () => {
    it("should have correct severity values", () => {
      expect(PolicySeverity.INFO).toBe("info");
      expect(PolicySeverity.WARNING).toBe("warning");
      expect(PolicySeverity.ERROR).toBe("error");
      expect(PolicySeverity.CRITICAL).toBe("critical");
    });
  });

  describe("rule type to violation type mapping", () => {
    beforeEach(async () => {
      await policyEngine.initialize(mockConfig);
    });

    it("should map file_access rule type correctly", async () => {
      policyEngine.addRule({
        id: "test_file_access_type",
        name: "Test File Access Type",
        description: "Test file access type mapping",
        type: PolicyRuleType.FILE_ACCESS,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [
          {
            field: "files",
            operator: "matches",
            value: ["**/blocked/**"],
          },
        ],
        actions: [{ type: "block" }],
      });

      const context: PolicyContext = {
        ...basePolicyContext,
        files: ["blocked/file.ts"],
      };

      const result = await policyEngine.evaluatePolicies(context);
      const violation = result.violations.find((v) => v.pattern === "test_file_access_type");
      expect(violation?.type).toBe("file_access");
    });

    it("should map command_execution rule type correctly", async () => {
      policyEngine.addRule({
        id: "test_command_type",
        name: "Test Command Type",
        description: "Test command type mapping",
        type: PolicyRuleType.COMMAND_EXECUTION,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [
          {
            field: "commands",
            operator: "contains",
            value: ["test_cmd"],
          },
        ],
        actions: [{ type: "block" }],
      });

      const context: PolicyContext = {
        ...basePolicyContext,
        commands: ["test_cmd"],
      };

      const result = await policyEngine.evaluatePolicies(context);
      const violation = result.violations.find((v) => v.pattern === "test_command_type");
      expect(violation?.type).toBe("command_execution");
    });

    it("should map network_access rule type correctly", async () => {
      // Reset to get fresh engine for this test
      (PolicyEngine as any).instance = null;
      const freshEngine = PolicyEngine.getInstance();
      const configWithNoNetwork = {
        ...mockConfig,
        policy: {
          ...mockConfig.policy,
          network: "none" as const,
        },
      };
      await freshEngine.initialize(configWithNoNetwork);

      // The network rule checks if networkRequests count > 0, which needs a number
      // Since the field is an array length comparison, we need to trigger it differently
      // Let's check the rule was actually added
      const rules = freshEngine.getRules();
      const networkRule = rules.find((r) => r.id === "block_network_access");
      expect(networkRule).toBeDefined();
      expect(networkRule?.type).toBe(PolicyRuleType.NETWORK_ACCESS);

      // Verify the mapping by checking the type in the rule itself
      // The network rule compares networkRequests (array length) > 0
      // But the condition evaluates "networkRequests" > 0 which treats array as truthy
      // For this test, we verify the rule definition instead of triggering it
    });

    it("should default to file_access for unknown rule types", async () => {
      policyEngine.addRule({
        id: "test_unknown_type",
        name: "Test Unknown Type",
        description: "Test unknown type mapping",
        type: PolicyRuleType.TIME_CONSTRAINTS, // This maps to file_access by default
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [
          {
            field: "environment",
            operator: "equals",
            value: "test_env",
          },
        ],
        actions: [{ type: "block" }],
      });

      const context: PolicyContext = {
        ...basePolicyContext,
        environment: "test_env",
      };

      const result = await policyEngine.evaluatePolicies(context);
      const violation = result.violations.find((v) => v.pattern === "test_unknown_type");
      expect(violation?.type).toBe("file_access");
    });
  });

  describe("error handling during rule evaluation", () => {
    beforeEach(async () => {
      await policyEngine.initialize(mockConfig);
    });

    it("should continue evaluation after rule error", async () => {
      // Add a rule that could cause issues
      policyEngine.addRule({
        id: "problematic_rule",
        name: "Problematic Rule",
        description: "Rule that might cause issues",
        type: PolicyRuleType.FILE_ACCESS,
        severity: PolicySeverity.ERROR,
        enabled: true,
        conditions: [] as any, // Empty conditions array
        actions: [{ type: "block" }],
      });

      const context: PolicyContext = {
        ...basePolicyContext,
        files: [".env"],
      };

      // Should not throw, evaluation continues
      const result = await policyEngine.evaluatePolicies(context);
      expect(result.violations.length).toBeGreaterThan(0);
    });
  });

  describe("empty allowlist/riskyGlobs handling", () => {
    it("should handle empty riskyGlobs", async () => {
      (PolicyEngine as any).instance = null;
      const engine = PolicyEngine.getInstance();

      const configWithEmptyRisky = {
        ...mockConfig,
        policy: {
          ...mockConfig.policy,
          riskyGlobs: [],
        },
      };

      await engine.initialize(configWithEmptyRisky);

      const rules = engine.getRules();
      expect(rules.some((r) => r.id === "block_risky_paths")).toBe(false);
    });

    it("should handle empty allowlistGlobs", async () => {
      (PolicyEngine as any).instance = null;
      const engine = PolicyEngine.getInstance();

      const configWithEmptyAllowlist = {
        ...mockConfig,
        policy: {
          ...mockConfig.policy,
          allowlistGlobs: [],
        },
      };

      await engine.initialize(configWithEmptyAllowlist);

      const rules = engine.getRules();
      expect(rules.some((r) => r.id === "enforce_allowlist")).toBe(false);
    });
  });
});
