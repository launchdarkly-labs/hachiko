import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";

// Mock the logger
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

// Mock fs with proper structure
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

// Mock glob
vi.mock("glob", () => ({
  glob: vi.fn(),
}));

import {
  parsePlanFile,
  discoverPlans,
  generateNormalizedFrontmatter,
  serializeFrontmatter,
  validatePlanDependencies,
  type MigrationPlan,
} from "../../../src/services/plans.js";
import { glob } from "glob";

describe("parsePlanFile", () => {
  const mockReadFile = vi.mocked(readFile);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should parse a valid migration plan file", async () => {
    const validPlanContent = `---
id: react-upgrade
title: "Upgrade React Components to v18"
owner: "@frontend-team"
status: draft
strategy:
  chunkBy: module
  maxOpenPRs: 2
checks:
  - "npm test"
  - "npm run typecheck"
rollback:
  - description: "Revert React version"
    command: "npm install react@17"
successCriteria:
  - "All components use React 18 features"
steps:
  - id: step1
    description: "Update function components"
    agent: claude-cli
dependsOn: []
touches: ["src/components/**"]
attempts: 0
---

# React Upgrade Migration

This migration upgrades all React components to use React 18 features.

## Overview

We will systematically upgrade components to use modern React patterns.
`;

    mockReadFile.mockResolvedValue(validPlanContent);

    const result = await parsePlanFile("migrations/react-upgrade.md");

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.plan.id).toBe("react-upgrade");
    expect(result.plan.frontmatter.title).toBe("Upgrade React Components to v18");
    expect(result.plan.frontmatter.status).toBe("draft");
    expect(result.plan.frontmatter.steps).toHaveLength(1);
    expect(result.plan.frontmatter.steps[0].id).toBe("step1");
    expect(result.plan.content).toContain("# React Upgrade Migration");
  });

  it("should handle invalid frontmatter gracefully", async () => {
    const invalidPlanContent = `---
id: invalid-plan
# Missing required fields and invalid YAML structure
strategy: invalid-strategy-value
steps: not-an-array
---

Some content here.
`;

    mockReadFile.mockResolvedValue(invalidPlanContent);

    const result = await parsePlanFile("migrations/invalid-plan.md");

    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Invalid frontmatter:");
    expect(result.plan.id).toBe("invalid-plan"); // Should still extract basic info
  });

  it("should validate that plans have at least one step", async () => {
    const planWithoutSteps = `---
id: empty-plan
title: "Empty Plan"
owner: "@test-team"
status: draft
strategy:
  chunkBy: module
steps: []
dependsOn: []
touches: []
attempts: 0
---

This plan has no steps.
`;

    mockReadFile.mockResolvedValue(planWithoutSteps);

    const result = await parsePlanFile("migrations/empty-plan.md");

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Migration plan must have at least one step");
  });

  it("should detect duplicate step IDs", async () => {
    const planWithDuplicateSteps = `---
id: duplicate-steps
title: "Plan with Duplicate Steps"
owner: "@test-team"
status: draft
strategy:
  chunkBy: module
steps:
  - id: step1
    description: "First step"
  - id: step1
    description: "Duplicate step"
  - id: step2
    description: "Second step"
dependsOn: []
touches: []
attempts: 0
---

This plan has duplicate step IDs.
`;

    mockReadFile.mockResolvedValue(planWithDuplicateSteps);

    const result = await parsePlanFile("migrations/duplicate-steps.md");

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Duplicate step IDs found: step1");
  });

  it("should validate that content is not empty", async () => {
    const planWithoutContent = `---
id: no-content
title: "Plan without content"
owner: "@test-team"
status: draft
strategy:
  chunkBy: module
steps:
  - id: step1
    description: "Test step"
dependsOn: []
touches: []
attempts: 0
---

`;

    mockReadFile.mockResolvedValue(planWithoutContent);

    const result = await parsePlanFile("migrations/no-content.md");

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Migration plan content cannot be empty");
  });

  it("should handle file read errors", async () => {
    mockReadFile.mockRejectedValue(new Error("File not found"));

    const result = await parsePlanFile("nonexistent.md");

    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toContain("Failed to read plan file:");
  });

  it("should handle malformed frontmatter gracefully", async () => {
    const malformedContent = `---
invalid yaml: [unclosed
---

Content here.
`;

    mockReadFile.mockResolvedValue(malformedContent);

    const result = await parsePlanFile("migrations/malformed.md");

    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("discoverPlans", () => {
  const mockGlob = vi.mocked(glob);
  const mockConfig = {
    plans: {
      directory: "migrations/",
      filenamePattern: "*.md",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should discover plan files in directory", async () => {
    const planFiles = ["/repo/migrations/plan1.md", "/repo/migrations/plan2.md"];

    mockGlob.mockResolvedValue(planFiles);

    const result = await discoverPlans("/repo", mockConfig as any);

    expect(result).toEqual(planFiles);
    expect(mockGlob).toHaveBeenCalledWith(
      expect.stringContaining("migrations/*.md"),
      expect.objectContaining({
        cwd: "/repo",
        absolute: true,
        ignore: ["**/node_modules/**", "**/.git/**"],
      })
    );
  });

  it("should handle empty directory", async () => {
    mockGlob.mockResolvedValue([]);

    const result = await discoverPlans("/repo", mockConfig as any);

    expect(result).toEqual([]);
  });
});

describe("validatePlanDependencies", () => {
  it("should detect missing dependencies", () => {
    const plans: MigrationPlan[] = [
      {
        id: "plan1",
        frontmatter: {
          id: "plan1",
          title: "Plan 1",
          owner: "@team",
          status: "draft",
          strategy: { chunkBy: "module", maxOpenPRs: 1 },
          checks: [],
          rollback: [],
          successCriteria: [],
          steps: [],
          dependsOn: ["nonexistent-plan"],
          touches: [],
          attempts: 0,
        },
        content: "",
        filePath: "",
      },
    ];

    const errors = validatePlanDependencies(plans);

    expect(errors).toContain('Plan "plan1" depends on non-existent plan "nonexistent-plan"');
  });

  it("should detect circular dependencies", () => {
    const plans: MigrationPlan[] = [
      {
        id: "plan1",
        frontmatter: {
          id: "plan1",
          title: "Plan 1",
          owner: "@team",
          status: "draft",
          strategy: { chunkBy: "module", maxOpenPRs: 1 },
          checks: [],
          rollback: [],
          successCriteria: [],
          steps: [],
          dependsOn: ["plan2"],
          touches: [],
          attempts: 0,
        },
        content: "",
        filePath: "",
      },
      {
        id: "plan2",
        frontmatter: {
          id: "plan2",
          title: "Plan 2",
          owner: "@team",
          status: "draft",
          strategy: { chunkBy: "module", maxOpenPRs: 1 },
          checks: [],
          rollback: [],
          successCriteria: [],
          steps: [],
          dependsOn: ["plan1"], // Circular dependency
          touches: [],
          attempts: 0,
        },
        content: "",
        filePath: "",
      },
    ];

    const errors = validatePlanDependencies(plans);

    expect(errors.some((error) => error.includes("Circular dependency detected"))).toBe(true);
  });

  it("should pass validation for valid dependencies", () => {
    const plans: MigrationPlan[] = [
      {
        id: "plan1",
        frontmatter: {
          id: "plan1",
          title: "Plan 1",
          owner: "@team",
          status: "draft",
          strategy: { chunkBy: "module", maxOpenPRs: 1 },
          checks: [],
          rollback: [],
          successCriteria: [],
          steps: [],
          dependsOn: [],
          touches: [],
          attempts: 0,
        },
        content: "",
        filePath: "",
      },
      {
        id: "plan2",
        frontmatter: {
          id: "plan2",
          title: "Plan 2",
          owner: "@team",
          status: "draft",
          strategy: { chunkBy: "module", maxOpenPRs: 1 },
          checks: [],
          rollback: [],
          successCriteria: [],
          steps: [],
          dependsOn: ["plan1"], // Valid dependency
          touches: [],
          attempts: 0,
        },
        content: "",
        filePath: "",
      },
    ];

    const errors = validatePlanDependencies(plans);

    expect(errors).toEqual([]);
  });
});

describe("generateNormalizedFrontmatter", () => {
  const mockConfig = {
    defaults: {
      agent: "claude-cli",
      labels: ["hachiko", "migration"],
    },
    agents: {
      "claude-cli": {
        kind: "cli",
        command: "claude",
      },
    },
  };

  it("should apply defaults to incomplete frontmatter", () => {
    const incompleteFrontmatter = {
      id: "test-plan",
      title: "Test Plan",
      owner: "@team",
      status: "draft" as const,
      strategy: { chunkBy: "module" as const, maxOpenPRs: 1 },
      checks: [],
      rollback: [],
      successCriteria: [],
      steps: [],
      dependsOn: [],
      touches: [],
      attempts: 0,
      // Missing agent field - should use default
    };

    const normalized = generateNormalizedFrontmatter(incompleteFrontmatter, mockConfig);

    // Should apply default agent
    expect(normalized.agent).toBe("claude-cli");

    // Should generate default steps if none provided
    expect(normalized.steps).toHaveLength(3);
    expect(normalized.steps[0].id).toBe("detect");
    expect(normalized.steps[1].id).toBe("implement");
    expect(normalized.steps[2].id).toBe("verify");
  });

  it("should preserve existing values when they exist", () => {
    const completeFrontmatter = {
      id: "test-plan",
      title: "Test Plan",
      owner: "@team",
      status: "active" as const,
      strategy: { chunkBy: "package" as const, maxOpenPRs: 3 },
      checks: [{ name: "test", command: "npm test" }],
      rollback: [{ description: "rollback", commands: ["git revert"] }],
      successCriteria: ["All tests pass"],
      steps: [
        {
          id: "step1",
          description: "Test step",
          agent: "custom-agent",
        },
      ],
      dependsOn: [],
      touches: ["src/**"],
      attempts: 2,
    };

    const normalized = generateNormalizedFrontmatter(completeFrontmatter, mockConfig);

    expect(normalized.status).toBe("active");
    expect(normalized.strategy.chunkBy).toBe("package");
    expect(normalized.steps[0].agent).toBe("custom-agent");
    expect(normalized.attempts).toBe(2);
  });
});

describe("serializeFrontmatter", () => {
  it("should serialize frontmatter to valid YAML", () => {
    const frontmatter = {
      id: "test-plan",
      title: "Test Migration Plan",
      owner: "@frontend-team",
      status: "draft" as const,
      strategy: {
        chunkBy: "module" as const,
        maxOpenPRs: 2,
      },
      checks: [
        {
          name: "TypeScript compilation",
          command: "tsc --noEmit",
        },
      ],
      rollback: [
        {
          description: "Revert changes",
          commands: ["git revert HEAD"],
        },
      ],
      successCriteria: ["All TypeScript errors resolved", "Tests pass"],
      steps: [
        {
          id: "update-imports",
          description: "Update import statements",
          agent: "claude-cli",
          prompt: "Update all import statements to use ES modules",
        },
      ],
      dependsOn: [],
      touches: ["src/**/*.ts"],
      attempts: 0,
    };

    const yaml = serializeFrontmatter(frontmatter);

    expect(yaml).toContain("id: test-plan");
    expect(yaml).toContain("title: Test Migration Plan");
    expect(yaml).toContain("status: draft");
    expect(yaml).toContain("chunkBy: module");
    expect(yaml).toContain("- name: TypeScript compilation");
    expect(yaml).toContain("- id: update-imports");

    // Should be valid YAML (no parsing errors when re-parsing)
    expect(() => {
      const matter = require("gray-matter");
      matter(`---\n${yaml}\n---\nContent`);
    }).not.toThrow();
  });

  it("should handle empty arrays and objects correctly", () => {
    const minimalFrontmatter = {
      id: "minimal",
      title: "Minimal Plan",
      owner: "@team",
      status: "draft" as const,
      strategy: {
        chunkBy: "module" as const,
        maxOpenPRs: 1,
      },
      checks: [],
      rollback: [],
      successCriteria: [],
      steps: [],
      dependsOn: [],
      touches: [],
      attempts: 0,
    };

    const yaml = serializeFrontmatter(minimalFrontmatter);

    expect(yaml).toContain("checks: []");
    expect(yaml).toContain("steps: []");
    expect(yaml).toContain("dependsOn: []");
  });
});
