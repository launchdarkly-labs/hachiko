/**
 * Scenario tests for PR detection, cloud agent detection, and normalization.
 */
import { describe, expect, it, vi } from "vitest";

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

import { GitHubSimulator } from "../../../src/testing/github-simulator.js";
import {
  detectHachikoPR,
  getOpenHachikoPRs,
  getHachikoPRs,
  correlateWithRecentDispatch,
  validateMigrationFileExists,
} from "../../../src/services/pr-detection.js";
import { normalizePR } from "../../../src/services/workflow-orchestration.js";

// ---------------------------------------------------------------------------
// Cloud Agent PR Detection
// ---------------------------------------------------------------------------

describe("Scenario: Cloud agent PR detection", () => {
  it("detects agent PR via tracking token in commit message (path 2)", async () => {
    const sim = new GitHubSimulator();
    sim.createPR({
      branch: "cursor/some-branch-name-9d93",
      title: "Add unit tests for utils",
      body: "Improves test coverage for utility functions.",
      labels: ["hachiko:migration"],
      commits: [
        { sha: "abc123", message: "hachiko-track:improve-test-coverage:1 add unit tests" },
        { sha: "def456", message: "add more test files" },
      ],
    });

    const ctx = sim.context();
    const prs = await getOpenHachikoPRs(ctx, "improve-test-coverage");

    expect(prs).toHaveLength(1);
    expect(prs[0]!.migrationId).toBe("improve-test-coverage");
    expect(prs[0]!.branch).toBe("cursor/some-branch-name-9d93");
  });

  it("detects agent PR via tracking token in PR body (path 2)", async () => {
    const sim = new GitHubSimulator();
    sim.createPR({
      branch: "devin/random-branch",
      title: "Refactor API layer",
      body: "<!-- hachiko-track:refactor-api:2 -->\nRefactored the API layer.",
      labels: ["hachiko:migration"],
    });

    const ctx = sim.context();
    const { data } = await ctx.octokit.pulls.list({ owner: "o", repo: "r", state: "open" });
    const result = detectHachikoPR(data[0] as any);
    expect(result).not.toBeNull();
    expect(result!.migrationId).toBe("refactor-api");
  });

  it("path 3: correlates agent branch with recent dispatch", () => {
    const result = correlateWithRecentDispatch("cursor/test-branch-abc", [
      {
        name: "Execute: improve-tests step 2",
        status: "completed",
        createdAt: "2024-06-01T10:00:00Z",
      },
    ]);
    expect(result).toBe("improve-tests");
  });

  it("path 3: ignores non-agent branches", () => {
    const result = correlateWithRecentDispatch("feature/my-feature", [
      { name: "Execute: test step 1", status: "completed", createdAt: "2024-06-01T10:00:00Z" },
    ]);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// File validation
// ---------------------------------------------------------------------------

describe("Scenario: Migration file validation", () => {
  it("validates detected migration has a corresponding file", () => {
    const files = new Set(["migrations/improve-test-coverage.md", "migrations/react-hooks.md"]);
    expect(validateMigrationFileExists("improve-test-coverage", files)).toBe(true);
    expect(validateMigrationFileExists("nonexistent", files)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PR Normalization
// ---------------------------------------------------------------------------

describe("Scenario: PR normalization for agent PRs", () => {
  it("normalizes a cursor PR with label and tracking comment", async () => {
    const sim = new GitHubSimulator();
    const pr = sim.createPR({
      branch: "cursor/test-coverage-step-1-f46a",
      title: "Test coverage step 1",
      labels: [],
    });
    const ctx = sim.context();

    const result = await normalizePR({
      prNumber: pr.number,
      migrationId: "improve-test-coverage",
      existingLabels: [],
      existingComments: [],
      context: ctx,
    });

    expect(result.labelAdded).toBe(true);
    expect(result.commentAdded).toBe(true);

    // Verify the label was actually added
    expect(sim.pullRequests.get(pr.number)!.labels).toContain("hachiko:migration");
  });

  it("does not double-normalize a PR", async () => {
    const sim = new GitHubSimulator();
    const pr = sim.createPR({
      branch: "devin/api-refactor-abc",
      title: "API refactor",
      labels: ["hachiko:migration"],
    });
    const ctx = sim.context();

    // First normalization
    await normalizePR({
      prNumber: pr.number,
      migrationId: "refactor-api",
      existingLabels: [],
      existingComments: [],
      context: ctx,
    });

    // Second normalization should be a no-op (existing comment has tracking token)
    const result = await normalizePR({
      prNumber: pr.number,
      migrationId: "refactor-api",
      existingLabels: ["hachiko:migration"],
      existingComments: ["<!-- hachiko-track:refactor-api --> some comment"],
      context: ctx,
    });
    expect(result.labelAdded).toBe(false);
    expect(result.commentAdded).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Mixed detection methods
// ---------------------------------------------------------------------------

describe("Scenario: Mixed PR detection across methods", () => {
  it("finds all Hachiko PRs for a migration across detection methods", async () => {
    const sim = new GitHubSimulator();

    // PR via branch naming (path 1)
    sim.createPR({
      branch: "hachiko/my-migration-step-1",
      title: "Step 1",
      labels: ["hachiko:migration"],
    });

    // PR via tracking token in body (path 2)
    sim.createPR({
      branch: "cursor/random-abc",
      title: "Step 2 agent work",
      body: "<!-- hachiko-track:my-migration:2 -->\nAgent work",
      labels: ["hachiko:migration"],
    });

    // Unrelated PR
    sim.createPR({
      branch: "feature/other",
      title: "Other stuff",
      labels: [],
    });

    const ctx = sim.context();
    const prs = await getHachikoPRs(ctx, "my-migration", "open");

    // Should find both Hachiko PRs but not the unrelated one
    expect(prs).toHaveLength(2);
    const branches = prs.map((p) => p.branch).sort();
    expect(branches).toEqual(["cursor/random-abc", "hachiko/my-migration-step-1"]);
  });
});
