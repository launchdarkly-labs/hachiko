import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock everything at the module level
vi.mock("../../../src/utils/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

vi.mock("node:path", () => ({
  join: vi.fn(),
}));

// Mock yaml - using vi.mock instead of vi.doMock
vi.mock("yaml", () => ({
  parse: vi.fn(),
}));

import {
  generateAgentInstructions,
  generateAgentInstructionsFromRepo,
  generateAgentSpecificInstructions,
} from "../../../src/services/agent-instructions.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as yamlParse } from "yaml";

describe("Agent Instructions Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateAgentInstructions", () => {
    const migrationContext = {
      id: "react-upgrade",
      title: "React v16 to v18 migration",
      agent: "claude",
      filePath: "migrations/react-upgrade.md",
      created: "2024-01-15T10:00:00Z",
    };

    const repositoryContext = {
      owner: "test-owner",
      name: "test-repo",
      url: "https://github.com/test-owner/test-repo",
    };

    it("should generate agent instructions with template substitution", async () => {
      vi.mocked(readFile).mockResolvedValue(
        "Migration: {migration.id}\nAgent: {migration.agent}\nRepo: {repository.owner}/{repository.name}"
      );
      vi.mocked(join).mockReturnValue("/path/to/template");

      const result = await generateAgentInstructions(migrationContext, repositoryContext);

      expect(result).toContain("Migration: react-upgrade");
      expect(result).toContain("Agent: claude");
      expect(result).toContain("Repo: test-owner/test-repo");
    });

    it("should use fallback template when file read fails", async () => {
      vi.mocked(readFile).mockRejectedValue(new Error("File not found"));
      vi.mocked(join).mockReturnValue("/path/to/template");

      const result = await generateAgentInstructions(migrationContext, repositoryContext);

      expect(result).toContain("react-upgrade");
      expect(result).toContain("React v16 to v18 migration");
      expect(result).toContain("test-owner/test-repo");
    });
  });

  describe("generateAgentInstructionsFromRepo", () => {
    const mockContext = {
      octokit: {
        repos: {
          getContent: vi.fn(),
        },
      },
      payload: {
        repository: {
          owner: { login: "test-owner" },
          name: "test-repo",
          html_url: "https://github.com/test-owner/test-repo",
        },
      },
    };

    it("should fetch and parse migration document", async () => {
      const migrationContent = `---
id: react-upgrade
title: React Migration
agent: claude
created: 2024-01-15T10:00:00Z
---
Content here`;

      vi.mocked(mockContext.octokit.repos.getContent).mockResolvedValue({
        data: {
          content: Buffer.from(migrationContent).toString("base64"),
        },
      });

      vi.mocked(readFile).mockResolvedValue("Template: {migration.id}");
      vi.mocked(join).mockReturnValue("/template/path");

      // Mock yaml parse
      vi.mocked(yamlParse).mockReturnValue({
        id: "react-upgrade",
        title: "React Migration",
        agent: "claude",
        created: "2024-01-15T10:00:00Z",
      });

      const result = await generateAgentInstructionsFromRepo(mockContext as any, "react-upgrade");

      expect(result).toContain("react-upgrade");
      expect(mockContext.octokit.repos.getContent).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        path: "migrations/react-upgrade.md",
        ref: "main",
      });
    });

    it("should handle missing migration document", async () => {
      vi.mocked(mockContext.octokit.repos.getContent).mockResolvedValue({
        data: { type: "dir" },
      });

      await expect(
        generateAgentInstructionsFromRepo(mockContext as any, "nonexistent")
      ).rejects.toThrow("Migration document not found");
    });
  });

  describe("generateAgentSpecificInstructions", () => {
    const migrationContext = {
      id: "test-migration",
      title: "Test Migration",
      agent: "claude",
      filePath: "migrations/test.md",
      created: "2024-01-15T10:00:00Z",
    };

    const repositoryContext = {
      owner: "test-owner",
      name: "test-repo",
      url: "https://github.com/test-owner/test-repo",
    };

    it("should handle different agent types", async () => {
      vi.mocked(readFile).mockResolvedValue("Base template with {migration.id}");
      vi.mocked(join).mockReturnValue("/template/path");

      const agents = ["claude-cli", "cursor-cli", "devin", "codex", "mock"];
      
      for (const agent of agents) {
        const result = await generateAgentSpecificInstructions(
          agent,
          migrationContext,
          repositoryContext
        );
        expect(result).toContain("test-migration");
      }
    });

    it("should fallback to base template for unknown agents", async () => {
      vi.mocked(readFile).mockResolvedValue("Template: {migration.id}");
      vi.mocked(join).mockReturnValue("/template/path");

      const result = await generateAgentSpecificInstructions(
        "unknown-agent",
        migrationContext,
        repositoryContext
      );

      expect(result).toContain("test-migration");
    });
  });
});