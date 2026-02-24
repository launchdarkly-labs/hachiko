/**
 * Validates that the GitHubSimulator can replace vi.fn() mocks
 * for the actual pr-detection and state-inference services.
 */
import { describe, expect, it, vi } from "vitest";

// Mock the logger (required by services)
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
  getClosedHachikoPRs,
} from "../../../src/services/pr-detection.js";
import { loadHachikoConfig } from "../../../src/services/config.js";

describe("GitHubSimulator integration with services", () => {
  describe("pr-detection: getOpenHachikoPRs", () => {
    it("finds hachiko PRs via branch name (path 1)", async () => {
      const sim = new GitHubSimulator();
      sim.createPR({
        branch: "hachiko/my-migration-step-1",
        title: "Step 1",
        labels: ["hachiko:migration"],
      });
      sim.createPR({
        branch: "feature/unrelated",
        title: "Unrelated PR",
      });

      const ctx = sim.context();
      const prs = await getOpenHachikoPRs(ctx, "my-migration");
      expect(prs).toHaveLength(1);
      expect(prs[0]!.migrationId).toBe("my-migration");
      expect(prs[0]!.branch).toBe("hachiko/my-migration-step-1");
    });

    it("finds hachiko PRs via tracking token in commits (path 3)", async () => {
      const sim = new GitHubSimulator();
      sim.createPR({
        branch: "cursor/random-branch-abc",
        title: "Add tests",
        labels: ["hachiko:migration"],
        commits: [{ sha: "abc123", message: "hachiko-track:improve-tests:1 add unit tests" }],
      });

      const ctx = sim.context();
      const prs = await getOpenHachikoPRs(ctx, "improve-tests");
      expect(prs).toHaveLength(1);
      expect(prs[0]!.migrationId).toBe("improve-tests");
    });

    it("returns empty array when no matching PRs", async () => {
      const sim = new GitHubSimulator();
      sim.createPR({ branch: "feature/other", title: "Other" });

      const ctx = sim.context();
      const prs = await getOpenHachikoPRs(ctx, "nonexistent");
      expect(prs).toHaveLength(0);
    });
  });

  describe("pr-detection: getClosedHachikoPRs", () => {
    it("finds closed merged PRs", async () => {
      const sim = new GitHubSimulator();
      const pr = sim.createPR({
        branch: "hachiko/my-migration-step-1",
        title: "Step 1",
        labels: ["hachiko:migration"],
      });
      sim.mergePR(pr.number);

      const ctx = sim.context();
      const prs = await getClosedHachikoPRs(ctx, "my-migration");
      expect(prs).toHaveLength(1);
      expect(prs[0]!.merged).toBe(true);
    });

    it("finds closed non-merged PRs (paused)", async () => {
      const sim = new GitHubSimulator();
      const pr = sim.createPR({
        branch: "hachiko/my-migration-step-1",
        title: "Step 1",
        labels: ["hachiko:migration"],
      });
      sim.closePR(pr.number);

      const ctx = sim.context();
      const prs = await getClosedHachikoPRs(ctx, "my-migration");
      expect(prs).toHaveLength(1);
      expect(prs[0]!.merged).toBe(false);
    });
  });

  describe("config: loadHachikoConfig", () => {
    it("loads config from simulator file store", async () => {
      const sim = new GitHubSimulator();
      sim.setFile(
        ".hachiko.yml",
        [
          "plans:",
          "  directory: .hachiko/migrations",
          "agents:",
          "  cursor:",
          "    kind: cloud",
          "    provider: cursor",
        ].join("\n")
      );

      const ctx = sim.context();
      const config = await loadHachikoConfig(ctx);
      expect(config.plans.directory).toBe(".hachiko/migrations");
    });

    it("returns defaults when no config file exists", async () => {
      const sim = new GitHubSimulator();
      const ctx = sim.context();
      const config = await loadHachikoConfig(ctx);
      // Should return default config without throwing
      expect(config).toBeDefined();
    });
  });

  describe("detectHachikoPR with simulator-shaped data", () => {
    it("works with PR data from pulls.list", async () => {
      const sim = new GitHubSimulator();
      sim.createPR({
        branch: "hachiko/add-jsdoc-step-1",
        title: "[add-jsdoc] Step 1",
        labels: ["hachiko:migration"],
      });

      const ctx = sim.context();
      const { data } = await ctx.octokit.pulls.list({ owner: "o", repo: "r", state: "open" });
      const result = detectHachikoPR(data[0] as any);
      expect(result).not.toBeNull();
      expect(result!.migrationId).toBe("add-jsdoc");
    });
  });
});
