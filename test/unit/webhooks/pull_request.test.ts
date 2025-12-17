import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the services before importing modules that use them
vi.mock("../../../src/services/config.js", () => ({
  loadHachikoConfig: vi.fn(),
}));

vi.mock("../../../src/services/migrations.js", () => ({
  updateMigrationProgress: vi.fn(),
  emitNextStep: vi.fn(),
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
    });

    it("should skip processing non-Hachiko PRs", async () => {
      await handlePullRequest(mockContext, mockLogger);

      expect(mockLogger.debug).toHaveBeenCalledWith("PR is not managed by Hachiko, skipping");
      expect(loadHachikoConfig).not.toHaveBeenCalled();
    });
  });

  describe("when PR is a migration PR", () => {
    beforeEach(() => {
      mockContext.payload.pull_request.labels = [
        { name: "hachiko" },
        { name: "migration" },
        { name: "hachiko:plan:react-upgrade" },
        { name: "hachiko:step:react-upgrade:step1:src" },
      ];
      mockContext.payload.pull_request.head = {
        ref: "hachiko/react-upgrade/step1/src"
      };
      vi.mocked(loadHachikoConfig).mockResolvedValue({
        plans: { directory: "migrations/" },
        defaults: { agent: "claude-cli" },
      });
    });

    describe("and PR was merged", () => {
      beforeEach(() => {
        mockContext.payload.pull_request.merged = true;
        mockContext.payload.pull_request.merge_commit_sha = "abc123";
        vi.mocked(updateMigrationProgress).mockResolvedValue(undefined);
        vi.mocked(emitNextStep).mockResolvedValue(undefined);
      });

      it("should handle merged PR correctly", async () => {
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

      it("should handle migration metadata extraction correctly", async () => {
        await handlePullRequest(mockContext, mockLogger);

        expect(mockLogger.info).toHaveBeenCalledWith(
          { migrationMeta: { planId: "react-upgrade", stepId: "step1", chunk: "src" } },
          "Extracted migration metadata"
        );
      });
    });

    describe("and PR was closed without merging", () => {
      beforeEach(() => {
        mockContext.payload.pull_request.merged = false;
        vi.mocked(updateMigrationProgress).mockResolvedValue(undefined);
        mockOctokit.issues.listForRepo.mockResolvedValue({
          data: [{ number: 456, title: "Migration: react-upgrade" }]
        });
        mockOctokit.issues.createComment.mockResolvedValue({});
      });

      it("should handle closed PR correctly", async () => {
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
    });

    describe("when migration metadata cannot be extracted", () => {
      beforeEach(() => {
        mockContext.payload.pull_request.labels = [
          { name: "hachiko" },
          { name: "migration" },
          // No hachiko:step: label, so metadata extraction will fail
        ];
        mockContext.payload.pull_request.head = undefined; // No branch ref to avoid require issue
      });

      it("should handle invalid migration metadata gracefully", async () => {
        await handlePullRequest(mockContext, mockLogger);

        expect(mockLogger.warn).toHaveBeenCalledWith("Could not extract migration metadata from PR");
        expect(updateMigrationProgress).not.toHaveBeenCalled();
        expect(emitNextStep).not.toHaveBeenCalled();
      });
    });

    describe("when an error occurs", () => {
      beforeEach(() => {
        vi.mocked(loadHachikoConfig).mockRejectedValue(new Error("Config load failed"));
      });

      it("should log error and rethrow", async () => {
        await expect(handlePullRequest(mockContext, mockLogger)).rejects.toThrow("Config load failed");

        expect(mockLogger.error).toHaveBeenCalledWith(
          { error: expect.any(Error) },
          "Failed to handle pull request event"
        );
      });
    });

    describe("when no chunk is specified in PR title", () => {
      beforeEach(() => {
        mockContext.payload.pull_request.labels = [
          { name: "hachiko" },
          { name: "migration" },
          { name: "hachiko:plan:react-upgrade" },
          { name: "hachiko:step:react-upgrade:step1" }, // No chunk specified
        ];
        mockContext.payload.pull_request.merged = false;
        vi.mocked(updateMigrationProgress).mockResolvedValue(undefined);
        mockOctokit.issues.listForRepo.mockResolvedValue({
          data: [{ number: 456, title: "Migration: react-upgrade" }]
        });
      });

      it("should handle undefined chunk correctly", async () => {
        await handlePullRequest(mockContext, mockLogger);

        expect(updateMigrationProgress).toHaveBeenCalledWith(
          mockContext,
          "react-upgrade",
          "step1",
          "skipped", 
          {
            prNumber: 123,
            chunk: undefined,
            reason: "PR closed without merging",
          },
          mockLogger
        );

        expect(mockOctokit.issues.createComment).toHaveBeenCalledWith(
          expect.objectContaining({
            body: expect.stringContaining("⚠️ **Step Skipped**: `step1`"),
          })
        );
      });
    });
  });
});