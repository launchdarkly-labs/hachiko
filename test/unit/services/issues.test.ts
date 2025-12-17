import { beforeEach, describe, expect, it, vi } from "vitest";

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

// Mock plans service
vi.mock("../../../src/services/plans.js", () => ({
  generateNormalizedFrontmatter: vi.fn(),
  serializeFrontmatter: vi.fn(),
}));

import {
  createMigrationIssue,
  createPlanReviewPR,
} from "../../../src/services/issues.js";
import { generateNormalizedFrontmatter, serializeFrontmatter } from "../../../src/services/plans.js";
import { createMockContext } from "../../mocks/github.js";
import { createLogger } from "../../../src/utils/logger.js";

describe("createMigrationIssue", () => {
  let mockContext: any;
  let mockOctokit: any;
  let mockLogger: any;

  beforeEach(() => {
    mockOctokit = {
      issues: {
        create: vi.fn(),
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

    mockLogger = createLogger("test");
    vi.clearAllMocks();
  });

  it("should create migration issue with correct title and labels", async () => {
    const mockPlan = {
      id: "react-upgrade",
      frontmatter: {
        id: "react-upgrade",
        title: "Upgrade to React 18",
        owner: "@frontend-team",
        status: "draft" as const,
        strategy: { chunkBy: "module" as const, maxOpenPRs: 2 },
        checks: ["npm test"],
        rollback: [{ description: "Revert", command: "revert" }],
        successCriteria: ["All tests pass"],
        steps: [{ id: "step1", description: "Update components" }],
        dependsOn: [],
        touches: ["src/**"],
        attempts: 0,
      },
      content: "Migration plan content",
      filePath: "migrations/react-upgrade.md",
    };

    const mockConfig = {
      defaults: {
        labels: ["hachiko", "migration"],
      },
    };

    mockOctokit.issues.create.mockResolvedValue({
      data: {
        number: 123,
        html_url: "https://github.com/test-owner/test-repo/issues/123",
      },
    });

    await createMigrationIssue(mockContext, mockPlan, mockConfig as any, mockLogger);

    expect(mockOctokit.issues.create).toHaveBeenCalledWith({
      owner: "test-owner",
      repo: "test-repo",
      title: "[Migration] Upgrade to React 18",
      body: expect.stringContaining("react-upgrade"),
      labels: [
        "hachiko",
        "migration",
        "hachiko:plan:react-upgrade",
        "hachiko:status:draft",
        "hachiko",
        "migration",
      ],
    });

    expect(mockLogger.info).toHaveBeenCalledWith(
      { planId: "react-upgrade" },
      "Creating Migration Issue"
    );

    expect(mockLogger.info).toHaveBeenCalledWith(
      {
        planId: "react-upgrade",
        issueNumber: 123,
        issueUrl: "https://github.com/test-owner/test-repo/issues/123",
      },
      "Created Migration Issue"
    );
  });

  it("should handle GitHub API errors gracefully", async () => {
    const mockPlan = {
      id: "test-plan",
      frontmatter: {
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
      },
      content: "",
      filePath: "",
    };

    const mockConfig = {
      defaults: { labels: ["hachiko"] },
    };

    const apiError = new Error("GitHub API Error");
    mockOctokit.issues.create.mockRejectedValue(apiError);

    await expect(
      createMigrationIssue(mockContext, mockPlan, mockConfig as any, mockLogger)
    ).rejects.toThrow("GitHub API Error");

    expect(mockLogger.error).toHaveBeenCalledWith(
      { error: apiError, planId: "test-plan" },
      "Failed to create Migration Issue"
    );
  });
});

describe("createPlanReviewPR", () => {
  let mockContext: any;
  let mockOctokit: any;
  let mockLogger: any;

  beforeEach(() => {
    mockOctokit = {
      git: {
        createRef: vi.fn(),
      },
      repos: {
        createOrUpdateFileContents: vi.fn(),
        getBranch: vi.fn(),
      },
      pulls: {
        create: vi.fn(),
      },
      issues: {
        addLabels: vi.fn(),
      },
    };

    mockContext = createMockContext(
      "push",
      {
        repository: {
          owner: { login: "test-owner" },
          name: "test-repo",
          default_branch: "main",
        },
      },
      mockOctokit
    );

    mockLogger = createLogger("test");
    
    // Mock the plans service functions
    vi.mocked(generateNormalizedFrontmatter).mockReturnValue({
      id: "test-plan",
      title: "Test Plan",
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
    } as any);

    vi.mocked(serializeFrontmatter).mockReturnValue("id: test-plan\ntitle: Test Plan");

    vi.clearAllMocks();
  });

  it("should create plan review PR with normalized frontmatter", async () => {
    const mockPlan = {
      id: "test-plan",
      frontmatter: {
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
      },
      content: "Plan content here",
      filePath: "migrations/test-plan.md",
    };

    const mockConfig = {
      defaults: { labels: ["hachiko"] },
    };

    // Mock successful API responses
    mockOctokit.repos.getBranch.mockResolvedValue({
      data: { commit: { sha: "main-sha-123" } },
    });

    mockOctokit.git.createRef.mockResolvedValue({});
    mockOctokit.repos.createOrUpdateFileContents.mockResolvedValue({});
    mockOctokit.pulls.create.mockResolvedValue({
      data: {
        number: 456,
        html_url: "https://github.com/test-owner/test-repo/pull/456",
      },
    });
    mockOctokit.issues.addLabels.mockResolvedValue({});

    await createPlanReviewPR(mockContext, mockPlan, mockConfig as any, mockLogger);

    expect(generateNormalizedFrontmatter).toHaveBeenCalledWith(mockPlan.frontmatter, mockConfig);
    expect(serializeFrontmatter).toHaveBeenCalled();

    expect(mockOctokit.git.createRef).toHaveBeenCalledWith({
      owner: "test-owner",
      repo: "test-repo",
      ref: "refs/heads/hachi/plan-review/test-plan",
      sha: "main-sha-123",
    });

    expect(mockOctokit.repos.createOrUpdateFileContents).toHaveBeenCalledWith({
      owner: "test-owner",
      repo: "test-repo",
      path: "migrations/test-plan.md",
      message: "Hachiko: Normalize plan frontmatter for test-plan",
      content: expect.any(String),
      branch: "hachi/plan-review/test-plan",
    });

    expect(mockOctokit.pulls.create).toHaveBeenCalledWith({
      owner: "test-owner",
      repo: "test-repo",
      title: "[Plan Review] Test Plan",
      head: "hachi/plan-review/test-plan",
      base: "main",
      body: expect.stringContaining("test-plan"),
    });
  });

  it("should handle errors during PR creation", async () => {
    const mockPlan = {
      id: "error-plan",
      frontmatter: {
        id: "error-plan",
        title: "Error Plan",
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
      },
      content: "content",
      filePath: "migrations/error-plan.md",
    };

    const mockConfig = { defaults: { labels: [] } };

    const gitError = new Error("Failed to create branch");
    mockOctokit.repos.getBranch.mockRejectedValue(gitError);

    await expect(
      createPlanReviewPR(mockContext, mockPlan, mockConfig as any, mockLogger)
    ).rejects.toThrow("Failed to create branch");

    expect(mockLogger.error).toHaveBeenCalledWith(
      { error: gitError, planId: "error-plan" },
      "Failed to create Plan Review PR"
    );
  });

  it("should generate correct PR body with plan details", async () => {
    const mockPlan = {
      id: "detailed-plan",
      frontmatter: {
        id: "detailed-plan",
        title: "Detailed Migration Plan",
        owner: "@senior-team",
        status: "draft" as const,
        strategy: { chunkBy: "package" as const, maxOpenPRs: 3 },
        checks: ["npm test", "npm run lint"],
        rollback: [{ description: "Rollback step", command: "git revert" }],
        successCriteria: ["All tests pass", "No linting errors"],
        steps: [
          { id: "step1", description: "First step" },
          { id: "step2", description: "Second step" },
        ],
        dependsOn: ["dependency-plan"],
        touches: ["src/**", "test/**"],
        attempts: 0,
      },
      content: "Detailed plan content",
      filePath: "migrations/detailed-plan.md",
    };

    const mockConfig = { defaults: { labels: ["migration"] } };

    mockOctokit.repos.getBranch.mockResolvedValue({
      data: { commit: { sha: "branch-sha" } },
    });
    mockOctokit.git.createRef.mockResolvedValue({});
    mockOctokit.repos.createOrUpdateFileContents.mockResolvedValue({});
    mockOctokit.pulls.create.mockResolvedValue({
      data: { number: 789, html_url: "https://github.com/test/repo/pull/789" },
    });
    mockOctokit.issues.addLabels.mockResolvedValue({});

    await createPlanReviewPR(mockContext, mockPlan, mockConfig as any, mockLogger);

    const createPRCall = mockOctokit.pulls.create.mock.calls[0][0];
    const prBody = createPRCall.body;

    expect(prBody).toContain("detailed-plan");
    expect(prBody).toContain("Detailed Migration Plan");
    expect(prBody).toContain("@senior-team");
    // The actual PR body template doesn't include step count
  });
});