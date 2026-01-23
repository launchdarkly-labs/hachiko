import { describe, it, expect } from "vitest";
import { detectHachikoPR } from "../../../src/services/pr-detection.js";
import type { PullRequest } from "../../../src/services/pr-detection.js";

describe("PR Detection Merged Field Fix", () => {
  it("should correctly detect merged PRs using merged_at field", () => {
    const mergedPR: PullRequest = {
      number: 74,
      title: "Migration: Add JSDoc comments to utility functions (Step 2/4)",
      state: "closed",
      head: { ref: "hachiko/add-jsdoc-comments-step-2" },
      labels: [{ name: "hachiko:migration" }, { name: "devin-pr" }],
      html_url: "https://github.com/launchdarkly-labs/hachiko/pull/74",
      merged_at: "2026-01-23T18:40:48Z",
    };

    const result = detectHachikoPR(mergedPR);

    expect(result).not.toBeNull();
    expect(result?.merged).toBe(true);
    expect(result?.state).toBe("closed");
    expect(result?.migrationId).toBe("add-jsdoc-comments");
  });

  it("should correctly detect non-merged closed PRs using merged_at field", () => {
    const closedPR: PullRequest = {
      number: 69,
      title: "Migration: Add JSDoc comments to utility functions (Step 1/4)",
      state: "closed",
      head: { ref: "hachiko/add-jsdoc-comments-step-1" },
      labels: [{ name: "hachiko:migration" }, { name: "devin-pr" }],
      html_url: "https://github.com/launchdarkly-labs/hachiko/pull/69",
      merged_at: null,
    };

    const result = detectHachikoPR(closedPR);

    expect(result).not.toBeNull();
    expect(result?.merged).toBe(false);
    expect(result?.state).toBe("closed");
    expect(result?.migrationId).toBe("add-jsdoc-comments");
  });

  it("should correctly handle open PRs (merged_at should be null)", () => {
    const openPR: PullRequest = {
      number: 123,
      title: "Migration: Add JSDoc comments to utility functions (Step 3/4)",
      state: "open",
      head: { ref: "hachiko/add-jsdoc-comments-step-3" },
      labels: [{ name: "hachiko:migration" }],
      html_url: "https://github.com/launchdarkly-labs/hachiko/pull/123",
      merged_at: null,
    };

    const result = detectHachikoPR(openPR);

    expect(result).not.toBeNull();
    expect(result?.merged).toBe(false);
    expect(result?.state).toBe("open");
    expect(result?.migrationId).toBe("add-jsdoc-comments");
  });
});