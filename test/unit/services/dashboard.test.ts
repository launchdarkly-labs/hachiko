import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("../../../src/utils/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("../../../src/services/state-inference.js", () => ({
  getMultipleMigrationStates: vi.fn(),
  getMigrationStateSummary: vi.fn(),
}));

vi.mock("../../../src/utils/migration-document.js", () => ({
  parseMigrationDocumentContent: vi.fn(),
}));

import {
  generateMigrationDashboard,
  generateDashboardMarkdown,
  updateDashboardInRepo,
} from "../../../src/services/dashboard.js";
import {
  getMultipleMigrationStates,
  getMigrationStateSummary,
} from "../../../src/services/state-inference.js";
import { parseMigrationDocumentContent } from "../../../src/utils/migration-document.js";

describe("Dashboard Service", () => {
  const mockContext = {
    octokit: {
      repos: {
        getContent: vi.fn(),
        createOrUpdateFileContents: vi.fn(),
      },
    },
    payload: {
      repository: {
        owner: { login: "test-owner" },
        name: "test-repo",
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateMigrationDashboard", () => {
    it("should generate dashboard with active and completed migrations", async () => {
      // Mock discovering migration files
      vi.mocked(mockContext.octokit.repos.getContent).mockResolvedValueOnce({
        data: [
          { type: "file", name: "migration1.md", path: "migrations/migration1.md" },
          { type: "file", name: "migration2.md", path: "migrations/migration2.md" },
        ],
      });

      // Mock getting file contents for each migration
      const migration1Content = `---
id: migration1
title: First Migration
agent: claude
---
Content here`;
      const migration2Content = `---
id: migration2
title: Second Migration
agent: devin
---
Content here`;

      vi.mocked(mockContext.octokit.repos.getContent)
        .mockResolvedValueOnce({
          data: { content: Buffer.from(migration1Content).toString("base64") },
        })
        .mockResolvedValueOnce({
          data: { content: Buffer.from(migration2Content).toString("base64") },
        });

      // Mock parsing migration documents
      vi.mocked(parseMigrationDocumentContent)
        .mockReturnValueOnce({
          frontmatter: { id: "migration1", title: "First Migration", agent: "claude" },
          content: "Content here",
        })
        .mockReturnValueOnce({
          frontmatter: { id: "migration2", title: "Second Migration", agent: "devin" },
          content: "Content here",
        });

      // Mock migration states
      vi.mocked(getMultipleMigrationStates).mockResolvedValue(
        new Map([
          [
            "migration1",
            {
              state: "active",
              openPRs: [
                {
                  number: 123,
                  url: "https://github.com/test/repo/pull/123",
                  title: "Test PR",
                } as any,
              ],
              closedPRs: [],
              allTasksComplete: false,
              totalTasks: 5,
              completedTasks: 2,
              lastUpdated: "2024-01-15T10:00:00Z",
            },
          ],
          [
            "migration2",
            {
              state: "completed",
              openPRs: [],
              closedPRs: [],
              allTasksComplete: true,
              totalTasks: 3,
              completedTasks: 3,
              lastUpdated: "2024-01-15T11:00:00Z",
            },
          ],
        ])
      );

      vi.mocked(getMigrationStateSummary)
        .mockReturnValueOnce("Active (1 open PR • 2/5 tasks complete)")
        .mockReturnValueOnce("Completed (all 3 tasks finished)");

      const result = await generateMigrationDashboard(mockContext as any);

      expect(result.totalMigrations).toBe(2);
      expect(result.active).toHaveLength(1);
      expect(result.completed).toHaveLength(1);
      expect(result.active[0].id).toBe("migration1");
      expect(result.completed[0].id).toBe("migration2");
    });

    it("should handle empty migrations directory", async () => {
      vi.mocked(mockContext.octokit.repos.getContent).mockResolvedValue({
        data: [],
      });

      const result = await generateMigrationDashboard(mockContext as any);

      expect(result.totalMigrations).toBe(0);
      expect(result.active).toHaveLength(0);
      expect(result.completed).toHaveLength(0);
    });

    it("should handle missing migrations directory", async () => {
      const error = new Error("Not Found");
      (error as any).status = 404;
      vi.mocked(mockContext.octokit.repos.getContent).mockRejectedValue(error);

      const result = await generateMigrationDashboard(mockContext as any);

      expect(result.totalMigrations).toBe(0);
    });
  });

  describe("generateDashboardMarkdown", () => {
    it("should format dashboard as markdown", () => {
      const mockDashboard = {
        lastUpdated: "2024-01-15T10:00:00Z",
        totalMigrations: 1,
        active: [
          {
            id: "test-migration",
            title: "Test Migration",
            state: "active" as const,
            summary: "Active (1 open PR)",
            stateInfo: {
              state: "active" as const,
              openPRs: [
                {
                  number: 123,
                  url: "https://github.com/test/repo/pull/123",
                  title: "Test PR",
                } as any,
              ],
              closedPRs: [],
              totalTasks: 5,
              completedTasks: 2,
              allTasksComplete: false,
              lastUpdated: "2024-01-15T10:00:00Z",
            },
            filePath: "migrations/test.md",
          },
        ],
        completed: [],
        pending: [],
        paused: [],
      };

      const result = generateDashboardMarkdown(mockDashboard);

      expect(result).toContain("# Migration Dashboard");
      expect(result).toContain("**Total Migrations:** 1");
      expect(result).toContain("## 🚀 Active");
      expect(result).toContain("**Test Migration**");
      expect(result).toContain("[PR #123](https://github.com/test/repo/pull/123)");
    });

    it("should handle empty dashboard", () => {
      const emptyDashboard = {
        lastUpdated: "2024-01-15T10:00:00Z",
        totalMigrations: 0,
        active: [],
        completed: [],
        pending: [],
        paused: [],
      };

      const result = generateDashboardMarkdown(emptyDashboard);

      expect(result).toContain("# Migration Dashboard");
      expect(result).toContain("**Total Migrations:** 0");
    });
  });

  describe("updateDashboardInRepo", () => {
    beforeEach(() => {
      // Mock successful dashboard generation (empty for simplicity)
      vi.mocked(mockContext.octokit.repos.getContent).mockResolvedValueOnce({
        data: [],
      });
    });

    it("should create new dashboard file", async () => {
      // Mock file doesn't exist
      const notFoundError = new Error("Not Found");
      (notFoundError as any).status = 404;
      vi.mocked(mockContext.octokit.repos.getContent).mockRejectedValueOnce(notFoundError);

      vi.mocked(mockContext.octokit.repos.createOrUpdateFileContents).mockResolvedValue({} as any);

      await updateDashboardInRepo(mockContext as any, "MIGRATION_DASHBOARD.md");

      expect(mockContext.octokit.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: "test-owner",
          repo: "test-repo",
          path: "MIGRATION_DASHBOARD.md",
          message: expect.stringContaining("Update migration dashboard"),
          content: expect.any(String),
          branch: "main",
        })
      );
    });

    it("should update existing dashboard file", async () => {
      // Mock existing file
      vi.mocked(mockContext.octokit.repos.getContent).mockResolvedValueOnce({
        data: { sha: "existing-sha" },
      });

      vi.mocked(mockContext.octokit.repos.createOrUpdateFileContents).mockResolvedValue({} as any);

      await updateDashboardInRepo(mockContext as any, "MIGRATION_DASHBOARD.md");

      expect(mockContext.octokit.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: "test-owner",
          repo: "test-repo",
          path: "MIGRATION_DASHBOARD.md",
          sha: "existing-sha",
        })
      );
    });
  });
});
