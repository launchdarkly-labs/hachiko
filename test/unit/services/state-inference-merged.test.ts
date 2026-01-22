import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMigrationState } from "../../../src/services/state-inference.js";
import * as prDetection from "../../../src/services/pr-detection.js";
import type { HachikoPR } from "../../../src/services/pr-detection.js";

// Mock PR detection functions
vi.mock("../../../src/services/pr-detection.js");

describe("State Inference - Merged PR Logic", () => {
  const mockContext = {
    repo: { owner: "test-org", repo: "test-repo" },
    octokit: {} as any,
    payload: { repository: { name: "test-repo", owner: { login: "test-org" } } }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should remain active when there are open PRs", async () => {
    const openPRs: HachikoPR[] = [
      {
        number: 100,
        title: "Migration step 2",
        state: "open",
        migrationId: "test-migration",
        branch: "hachiko/test-migration-step-2", 
        labels: ["hachiko:migration"],
        url: "https://github.com/test-org/test-repo/pull/100",
        merged: false
      }
    ];

    const closedPRs: HachikoPR[] = [
      {
        number: 99,
        title: "Migration step 1", 
        state: "closed",
        migrationId: "test-migration",
        branch: "hachiko/test-migration-step-1",
        labels: ["hachiko:migration"],
        url: "https://github.com/test-org/test-repo/pull/99",
        merged: true // Merged PR
      }
    ];

    vi.mocked(prDetection.getOpenHachikoPRs).mockResolvedValue(openPRs);
    vi.mocked(prDetection.getClosedHachikoPRs).mockResolvedValue(closedPRs);

    const result = await getMigrationState(mockContext, "test-migration");

    expect(result.state).toBe("active");
    expect(result.openPRs).toHaveLength(1);
    expect(result.closedPRs).toHaveLength(1);
  });

  it("should be pending when all closed PRs were merged (progressing normally)", async () => {
    const openPRs: HachikoPR[] = [];

    const closedPRs: HachikoPR[] = [
      {
        number: 99,
        title: "Migration step 1",
        state: "closed", 
        migrationId: "test-migration",
        branch: "hachiko/test-migration-step-1",
        labels: ["hachiko:migration"],
        url: "https://github.com/test-org/test-repo/pull/99",
        merged: true // Successfully merged
      },
      {
        number: 98,
        title: "Migration step 0", 
        state: "closed",
        migrationId: "test-migration", 
        branch: "hachiko/test-migration-step-0",
        labels: ["hachiko:migration"],
        url: "https://github.com/test-org/test-repo/pull/98",
        merged: true // Also merged
      }
    ];

    vi.mocked(prDetection.getOpenHachikoPRs).mockResolvedValue(openPRs);
    vi.mocked(prDetection.getClosedHachikoPRs).mockResolvedValue(closedPRs);

    const result = await getMigrationState(mockContext, "test-migration");

    expect(result.state).toBe("pending");
    expect(result.openPRs).toHaveLength(0);
    expect(result.closedPRs).toHaveLength(2);
  });

  it("should be paused when there are closed PRs that were NOT merged", async () => {
    const openPRs: HachikoPR[] = [];

    const closedPRs: HachikoPR[] = [
      {
        number: 99,
        title: "Migration step 1",
        state: "closed",
        migrationId: "test-migration", 
        branch: "hachiko/test-migration-step-1",
        labels: ["hachiko:migration"],
        url: "https://github.com/test-org/test-repo/pull/99",
        merged: false // Closed without merging - agent gave up
      },
      {
        number: 98,
        title: "Migration step 0",
        state: "closed",
        migrationId: "test-migration",
        branch: "hachiko/test-migration-step-0", 
        labels: ["hachiko:migration"],
        url: "https://github.com/test-org/test-repo/pull/98",
        merged: true // This one was merged successfully
      }
    ];

    vi.mocked(prDetection.getOpenHachikoPRs).mockResolvedValue(openPRs);
    vi.mocked(prDetection.getClosedHachikoPRs).mockResolvedValue(closedPRs);

    const result = await getMigrationState(mockContext, "test-migration");

    expect(result.state).toBe("paused");
    expect(result.openPRs).toHaveLength(0);
    expect(result.closedPRs).toHaveLength(2);
  });

  it("should be paused when mix of merged and non-merged closed PRs exists", async () => {
    const openPRs: HachikoPR[] = [];

    const closedPRs: HachikoPR[] = [
      {
        number: 100,
        title: "Migration step 2",
        state: "closed",
        migrationId: "test-migration",
        branch: "hachiko/test-migration-step-2",
        labels: ["hachiko:migration"],
        url: "https://github.com/test-org/test-repo/pull/100", 
        merged: false // Failed attempt
      },
      {
        number: 99,
        title: "Migration step 1",
        state: "closed",
        migrationId: "test-migration",
        branch: "hachiko/test-migration-step-1",
        labels: ["hachiko:migration"], 
        url: "https://github.com/test-org/test-repo/pull/99",
        merged: true // Successful step
      }
    ];

    vi.mocked(prDetection.getOpenHachikoPRs).mockResolvedValue(openPRs);
    vi.mocked(prDetection.getClosedHachikoPRs).mockResolvedValue(closedPRs);

    const result = await getMigrationState(mockContext, "test-migration");

    expect(result.state).toBe("paused");
    expect(result.openPRs).toHaveLength(0);
    expect(result.closedPRs).toHaveLength(2);
  });

  it("should be pending when no PRs exist at all", async () => {
    const openPRs: HachikoPR[] = [];
    const closedPRs: HachikoPR[] = [];

    vi.mocked(prDetection.getOpenHachikoPRs).mockResolvedValue(openPRs);
    vi.mocked(prDetection.getClosedHachikoPRs).mockResolvedValue(closedPRs);

    const result = await getMigrationState(mockContext, "test-migration");

    expect(result.state).toBe("pending");
    expect(result.openPRs).toHaveLength(0);
    expect(result.closedPRs).toHaveLength(0);
  });
});