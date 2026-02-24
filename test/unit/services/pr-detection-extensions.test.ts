import { describe, expect, it } from "vitest";

import {
  correlateWithRecentDispatch,
  validateMigrationFileExists,
} from "../../../src/services/pr-detection.js";

describe("correlateWithRecentDispatch", () => {
  it("returns migration ID from most recent dispatch for cursor/ branch", () => {
    const result = correlateWithRecentDispatch("cursor/test-branch-abc", [
      {
        name: "Execute: improve-tests step 2",
        status: "completed",
        createdAt: "2024-06-01T10:00:00Z",
      },
      {
        name: "Execute: other-migration step 1",
        status: "completed",
        createdAt: "2024-05-30T10:00:00Z",
      },
    ]);
    expect(result).toBe("improve-tests");
  });

  it("returns migration ID for devin/ branch", () => {
    const result = correlateWithRecentDispatch("devin/some-branch", [
      {
        name: "Execute: react-migration step 3",
        status: "in_progress",
        createdAt: "2024-06-01T10:00:00Z",
      },
    ]);
    expect(result).toBe("react-migration");
  });

  it("returns null for non-agent branches", () => {
    const result = correlateWithRecentDispatch("feature/my-feature", [
      { name: "Execute: test step 1", status: "completed", createdAt: "2024-06-01T10:00:00Z" },
    ]);
    expect(result).toBeNull();
  });

  it("returns null for hachiko/ branches (already detected by path 1)", () => {
    const result = correlateWithRecentDispatch("hachiko/my-migration", [
      { name: "Execute: test step 1", status: "completed", createdAt: "2024-06-01T10:00:00Z" },
    ]);
    expect(result).toBeNull();
  });

  it("returns null when no dispatches match", () => {
    const result = correlateWithRecentDispatch("cursor/abc", []);
    expect(result).toBeNull();
  });

  it("filters out queued dispatches", () => {
    const result = correlateWithRecentDispatch("cursor/abc", [
      { name: "Execute: test step 1", status: "queued", createdAt: "2024-06-01T10:00:00Z" },
    ]);
    expect(result).toBeNull();
  });

  it("picks the most recent dispatch by createdAt", () => {
    const result = correlateWithRecentDispatch("cursor/abc", [
      {
        name: "Execute: old-migration step 1",
        status: "completed",
        createdAt: "2024-05-01T10:00:00Z",
      },
      {
        name: "Execute: new-migration step 1",
        status: "completed",
        createdAt: "2024-06-01T10:00:00Z",
      },
    ]);
    expect(result).toBe("new-migration");
  });
});

describe("validateMigrationFileExists", () => {
  it("returns true when file exists with full path", () => {
    const files = new Set(["migrations/test.md", "migrations/other.md"]);
    expect(validateMigrationFileExists("test", files)).toBe(true);
  });

  it("returns true when file exists with just filename", () => {
    const files = new Set(["test.md"]);
    expect(validateMigrationFileExists("test", files)).toBe(true);
  });

  it("returns true when file exists by bare ID", () => {
    const files = new Set(["test"]);
    expect(validateMigrationFileExists("test", files)).toBe(true);
  });

  it("returns false when file doesn't exist", () => {
    const files = new Set(["migrations/other.md"]);
    expect(validateMigrationFileExists("nonexistent", files)).toBe(false);
  });

  it("works with array input", () => {
    expect(validateMigrationFileExists("test", ["migrations/test.md", "migrations/other.md"])).toBe(
      true
    );
  });
});
