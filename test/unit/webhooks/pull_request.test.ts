import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the services before importing modules that use them
vi.mock("../../../src/services/config.js", () => ({
  loadHachikoConfig: vi.fn(),
}));

vi.mock("../../../src/services/migrations.js", () => ({
  updateMigrationProgress: vi.fn(),
  emitNextStep: vi.fn(),
}));

vi.mock("../../../src/services/dashboard.js", () => ({
  updateDashboardInRepo: vi.fn(),
}));

vi.mock("../../../src/services/state-inference.js", () => ({
  getMigrationStateWithDocument: vi.fn(),
}));

vi.mock("../../../src/utils/pr.js", () => ({
  extractMigrationMetadata: vi.fn(),
}));

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

// Mock the git utils
vi.mock("../../../src/utils/git.js", () => ({
  parseMigrationBranchName: vi.fn().mockReturnValue(null),
}));

import { handlePullRequest } from "../../../src/webhooks/pull_request.js";
import { loadHachikoConfig } from "../../../src/services/config.js";
import { updateMigrationProgress, emitNextStep } from "../../../src/services/migrations.js";
import { updateDashboardInRepo } from "../../../src/services/dashboard.js";
import { getMigrationStateWithDocument } from "../../../src/services/state-inference.js";
import { extractMigrationMetadata } from "../../../src/utils/pr.js";
import { createMockContext } from "../../mocks/github.js";
import { createLogger } from "../../../src/utils/logger.js";

describe("handlePullRequest", () => {
  let mockContext: any;
  let mockOctokit: any;
  let mockLogger: any;

  beforeEach(() => {
    mockOctokit = {
      issues: {
        listForRepo: vi.fn(),
        createComment: vi.fn(),
      },
    };

    mockContext = createMockContext(
      "pull_request.closed",
      {
        repository: {
          owner: { login: "test-owner" },
          name: "test-repo",
        },
        pull_request: {
          number: 123,
          title: "Regular PR",
          merged: false,
          html_url: "https://github.com/test-owner/test-repo/pull/123",
          merge_commit_sha: null,
          labels: [],
          head: {
            ref: "feature/some-regular-branch",
          },
        },
      },
      mockOctokit
    );

    mockLogger = createLogger("test");
    vi.clearAllMocks();
  });

  describe("when PR is not a migration PR", () => {
    beforeEach(() => {
      mockContext.payload.pull_request.labels = [];
      mockContext.payload.pull_request.head = {
        ref: "feature/some-regular-branch",
      };
    });

    it("should skip processing non-Hachiko PRs", async () => {
      await handlePullRequest(mockContext, mockLogger);

      expect(mockLogger.debug).toHaveBeenCalledWith("PR is not managed by Hachiko, skipping");
      expect(loadHachikoConfig).not.toHaveBeenCalled();
    });
  });

  describe("when PR is a migration PR", () => {
    beforeEach(() => {
      mockContext.payload.pull_request.labels = [{ name: "hachiko:migration" }];
      mockContext.payload.pull_request.head = {
        ref: "hachiko/react-upgrade-utility-functions",
      };
      mockContext.payload.pull_request.title = "[react-upgrade] Update utility functions";
      vi.mocked(loadHachikoConfig).mockResolvedValue({
        plans: { directory: "migrations/" },
        defaults: { agent: "claude-cli" },
      });
      vi.mocked(getMigrationStateWithDocument).mockResolvedValue({
        state: "active",
        openPRs: [],
        closedPRs: [],
        allTasksComplete: false,
        totalTasks: 5,
        completedTasks: 2,
        lastUpdated: new Date().toISOString(),
      });
      vi.mocked(updateDashboardInRepo).mockResolvedValue(undefined);
    });

    describe("and PR was merged", () => {
      beforeEach(() => {
        mockContext.payload.pull_request.merged = true;
        mockContext.payload.pull_request.merge_commit_sha = "abc123";
        mockContext.payload.action = "closed";
        vi.mocked(extractMigrationMetadata).mockReturnValue({
          planId: "react-upgrade",
          stepId: "step1",
          chunk: "src",
        });
        vi.mocked(updateMigrationProgress).mockResolvedValue(undefined);
        vi.mocked(emitNextStep).mockResolvedValue(undefined);
      });

      it("should handle merged PR with legacy metadata correctly", async () => {
        await handlePullRequest(mockContext, mockLogger);

        expect(loadHachikoConfig).toHaveBeenCalledWith(mockContext);
        expect(updateMigrationProgress).toHaveBeenCalledWith(
          mockContext,
          "react-upgrade",
          "step1",
          "completed",
          {
            prNumber: 123,
            mergeCommit: "abc123",
            chunk: "src",
          },
          mockLogger
        );
        expect(emitNextStep).toHaveBeenCalledWith(
          mockContext,
          "react-upgrade",
          "step1",
          "src",
          mockLogger
        );
      });

      it("should handle merged PR with new state inference system", async () => {
        vi.mocked(extractMigrationMetadata).mockReturnValue(null);

        await handlePullRequest(mockContext, mockLogger);

        expect(loadHachikoConfig).toHaveBeenCalledWith(mockContext);
        expect(getMigrationStateWithDocument).toHaveBeenCalledWith(
          mockContext,
          "react-upgrade",
          "main",
          mockLogger
        );
        expect(updateDashboardInRepo).toHaveBeenCalledWith(
          mockContext,
          "MIGRATION_DASHBOARD.md",
          mockLogger
        );
      });
    });

    describe("and PR was closed without merging", () => {
      beforeEach(() => {
        mockContext.payload.pull_request.merged = false;
        mockContext.payload.action = "closed";
        vi.mocked(extractMigrationMetadata).mockReturnValue({
          planId: "react-upgrade",
          stepId: "step1",
          chunk: "src",
        });
        vi.mocked(updateMigrationProgress).mockResolvedValue(undefined);
        mockOctokit.issues.listForRepo.mockResolvedValue({
          data: [{ number: 456, title: "Migration: react-upgrade" }],
        });
        mockOctokit.issues.createComment.mockResolvedValue({});
      });

      it("should handle closed PR with legacy metadata correctly", async () => {
        await handlePullRequest(mockContext, mockLogger);

        expect(updateMigrationProgress).toHaveBeenCalledWith(
          mockContext,
          "react-upgrade",
          "step1",
          "skipped",
          {
            prNumber: 123,
            chunk: "src",
            reason: "PR closed without merging",
          },
          mockLogger
        );
      });

      it("should add skipped step comment to migration issue", async () => {
        await handlePullRequest(mockContext, mockLogger);

        expect(mockOctokit.issues.listForRepo).toHaveBeenCalledWith({
          owner: "test-owner",
          repo: "test-repo",
          labels: "hachiko:plan:react-upgrade",
          state: "open",
        });

        expect(mockOctokit.issues.createComment).toHaveBeenCalledWith({
          owner: "test-owner",
          repo: "test-repo",
          issue_number: 456,
          body: expect.stringContaining("⚠️ **Step Skipped**: `step1` (src)"),
        });
      });

      it("should handle missing migration issue gracefully", async () => {
        mockOctokit.issues.listForRepo.mockResolvedValue({ data: [] });

        await handlePullRequest(mockContext, mockLogger);

        expect(mockLogger.warn).toHaveBeenCalledWith(
          { planId: "react-upgrade" },
          "No open Migration Issue found"
        );
        expect(mockOctokit.issues.createComment).not.toHaveBeenCalled();
      });

      it("should handle closed PR with new state inference system", async () => {
        vi.mocked(extractMigrationMetadata).mockReturnValue(null);

        await handlePullRequest(mockContext, mockLogger);

        expect(getMigrationStateWithDocument).toHaveBeenCalledWith(
          mockContext,
          "react-upgrade",
          "main",
          mockLogger
        );
        expect(updateDashboardInRepo).toHaveBeenCalledWith(
          mockContext,
          "MIGRATION_DASHBOARD.md",
          mockLogger
        );
      });
    });

    describe("when PR validation fails", () => {
      beforeEach(() => {
        mockContext.payload.action = "opened";
        mockContext.payload.pull_request.labels = [
          // Missing hachiko:migration label
        ];
        mockContext.payload.pull_request.head = {
          ref: "hachiko/react-upgrade-utility", // Valid hachiko branch
        };
        mockContext.payload.pull_request.title = "Regular PR title"; // No bracket notation
      });

      it("should provide validation feedback for improperly formatted PRs", async () => {
        await handlePullRequest(mockContext, mockLogger);

        expect(mockOctokit.issues.createComment).toHaveBeenCalledWith({
          owner: "test-owner",
          repo: "test-repo",
          issue_number: 123,
          body: expect.stringContaining("🤖 **Hachiko PR Validation**"),
        });
      });
    });

    describe("when an error occurs", () => {
      beforeEach(() => {
        vi.mocked(loadHachikoConfig).mockRejectedValue(new Error("Config load failed"));
      });

      it("should log error and rethrow", async () => {
        await expect(handlePullRequest(mockContext, mockLogger)).rejects.toThrow(
          "Config load failed"
        );

        expect(mockLogger.error).toHaveBeenCalledWith(
          { error: expect.any(Error), migrationId: "react-upgrade" },
          "Failed to handle pull request event"
        );
      });
    });

    describe("when handling different PR actions", () => {
      it("should handle opened PR", async () => {
        mockContext.payload.action = "opened";

        await handlePullRequest(mockContext, mockLogger);

        expect(loadHachikoConfig).toHaveBeenCalledWith(mockContext);
        expect(updateDashboardInRepo).toHaveBeenCalledWith(
          mockContext,
          "MIGRATION_DASHBOARD.md",
          mockLogger
        );
      });

      it("should handle synchronize PR", async () => {
        mockContext.payload.action = "synchronize";

        await handlePullRequest(mockContext, mockLogger);

        expect(loadHachikoConfig).toHaveBeenCalledWith(mockContext);
        expect(updateDashboardInRepo).toHaveBeenCalledWith(
          mockContext,
          "MIGRATION_DASHBOARD.md",
          mockLogger
        );
      });
    });
  });
});
