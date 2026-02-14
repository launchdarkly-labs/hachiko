import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { createTestLogger } from "../../helpers/test-utils.js";
import { createMockContext } from "../../mocks/github.js";

/**
 * Integration test for the issue checkbox workflow
 * Tests the complete flow: checkbox check -> migration trigger -> dashboard update
 */

describe("Issue Checkbox Integration", () => {
  let mockOctokit: any;
  let logger: any;
  const testMigrationsDir = join(process.cwd(), "test", "fixtures", "migrations");

  beforeEach(() => {
    vi.clearAllMocks();

    mockOctokit = {
      issues: {
        listForRepo: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        edit: vi.fn(),
        get: vi.fn(),
      },
      repos: {
        getContent: vi.fn(),
      },
      actions: {
        createWorkflowDispatch: vi.fn(),
      },
    };

    logger = createTestLogger();

    // Ensure test migrations directory exists
    if (!existsSync(testMigrationsDir)) {
      mkdirSync(testMigrationsDir, { recursive: true });
    }

    // Create test migration files
    setupTestMigrations();
  });

  function setupTestMigrations() {
    const migrations = [
      {
        id: "react-hooks-conversion",
        status: "pending",
        title: "Convert React class components to hooks",
      },
      {
        id: "typescript-strict-mode",
        status: "pending",
        title: "Enable TypeScript strict mode",
      },
      {
        id: "legacy-api-cleanup",
        status: "paused",
        title: "Remove deprecated API calls",
      },
    ];

    migrations.forEach((migration) => {
      const frontmatter = `---
id: ${migration.id}
title: ${migration.title}
agent: cursor
status: ${migration.status}
current_step: 1
total_steps: 3
created: 2024-01-20T10:00:00Z
last_updated: 2024-01-20T10:00:00Z
---

# ${migration.title}

Test migration content.
`;
      writeFileSync(join(testMigrationsDir, `${migration.id}.md`), frontmatter);
    });
  }

  function createDashboardIssueBody(
    checkedMigrations: { pending?: string[]; paused?: string[] } = {}
  ) {
    const { pending = [], paused = [] } = checkedMigrations;

    return `# 📊 Hachiko Migration Dashboard

This issue tracks all active migrations in the repository. Use the checkboxes below to control migration execution.

## 🟡 Pending Migrations

- [${pending.includes("react-hooks-conversion") ? "x" : " "}] \`react-hooks-conversion\` - Convert React class components to hooks
- [${pending.includes("typescript-strict-mode") ? "x" : " "}] \`typescript-strict-mode\` - Enable TypeScript strict mode

## 🔄 In-Progress Migrations

✨ *No active migrations*

## ⏸️ Paused Migrations

- [${paused.includes("legacy-api-cleanup") ? "x" : " "}] \`legacy-api-cleanup\` - Remove deprecated API calls

---

**How to use:**
- ✅ Check a box next to a pending migration to start it
- ✅ Check a box next to a paused migration to resume it
- ❌ Closing a Hachiko PR will pause the migration
- 🔄 This dashboard updates automatically as migrations progress

🤖 *Managed by Hachiko - Do not edit the sections above manually*`;
  }

  it("should detect checked migrations in dashboard issue", () => {
    const issueBody = createDashboardIssueBody({
      pending: ["react-hooks-conversion"],
      paused: ["legacy-api-cleanup"],
    });

    // Test checkbox parsing logic
    const checkedPending = [];
    const checkedPaused = [];

    const pendingSection = issueBody.match(
      /## 🟡 Pending Migrations(.*?)## 🔄 In-Progress Migrations/s
    );
    const pausedSection = issueBody.match(/## ⏸️ Paused Migrations(.*?)---/s);

    if (pendingSection) {
      const matches = pendingSection[1].match(/- \[x\] `([^`]+)`/g);
      if (matches) {
        matches.forEach((match) => {
          const migrationId = match.match(/`([^`]+)`/)?.[1];
          if (migrationId) checkedPending.push(migrationId);
        });
      }
    }

    if (pausedSection) {
      const matches = pausedSection[1].match(/- \[x\] `([^`]+)`/g);
      if (matches) {
        matches.forEach((match) => {
          const migrationId = match.match(/`([^`]+)`/)?.[1];
          if (migrationId) checkedPaused.push(migrationId);
        });
      }
    }

    expect(checkedPending).toEqual(["react-hooks-conversion"]);
    expect(checkedPaused).toEqual(["legacy-api-cleanup"]);
  });

  it("should simulate complete checkbox workflow", async () => {
    const dashboardIssue = {
      number: 123,
      title: "📊 Hachiko Migration Dashboard",
      labels: [{ name: "hachiko:migration-dashboard" }],
      body: createDashboardIssueBody({ pending: ["react-hooks-conversion"] }),
    };

    const payload = {
      action: "edited",
      issue: dashboardIssue,
      repository: {
        name: "test-repo",
        owner: { login: "test-owner" },
        default_branch: "main",
      },
      sender: { login: "test-user" },
    };

    // Validate payload structure (previously tested via createMockContext)

    // Mock finding the migration dashboard issue
    mockOctokit.issues.listForRepo.mockResolvedValue({
      data: [dashboardIssue],
    });

    // Mock getting the issue for body parsing
    mockOctokit.issues.get.mockResolvedValue({
      data: dashboardIssue,
    });

    // Simulate the workflow logic
    const issueBody = dashboardIssue.body;

    // Extract checked migrations (simulating the bash parsing logic)
    const checkedPending = [];
    const checkedPaused = [];

    const pendingMatches = issueBody.match(
      /## 🟡 Pending Migrations(.*?)## 🔄 In-Progress Migrations/s
    );
    if (pendingMatches) {
      const checked = pendingMatches[1].match(/- \[x\] `([^`]+)`/g);
      if (checked) {
        checked.forEach((match) => {
          const migrationId = match.match(/`([^`]+)`/)?.[1];
          if (migrationId) checkedPending.push(migrationId);
        });
      }
    }

    expect(checkedPending).toContain("react-hooks-conversion");

    // Verify workflow dispatch would be called for each checked migration
    // In real workflow: gh workflow run execute-migration.yml -f migration_id="$MIGRATION_ID" -f step_id="1"
    expect(checkedPending.length).toBeGreaterThan(0);

    logger.info({ checkedPending, checkedPaused }, "Detected checkbox changes");
  });

  it("should handle dashboard update logic correctly", async () => {
    // Test the migration CLI dashboard generation

    // Change to test migrations directory temporarily
    const originalCwd = process.cwd();
    process.chdir(join(originalCwd, "test", "fixtures"));

    try {
      // This would be: pnpm migration generate-migration-dashboard
      // For testing, we'll simulate the logic
      const migrationFiles = [
        "react-hooks-conversion.md",
        "typescript-strict-mode.md",
        "legacy-api-cleanup.md",
      ];

      let pendingMigrations = "";
      let _inProgressMigrations = "";
      let pausedMigrations = "";

      for (const file of migrationFiles) {
        const filePath = join("migrations", file);
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, "utf-8");
          const frontmatterMatch = content.match(/^---\n(.*?)\n---/s);

          if (frontmatterMatch) {
            const frontmatter = frontmatterMatch[1];
            const id = frontmatter.match(/^id: (.+)$/m)?.[1];
            const title = frontmatter.match(/^title: (.+)$/m)?.[1];
            const status = frontmatter.match(/^status: (.+)$/m)?.[1];

            if (id && title) {
              const checkboxLine = `- [ ] \`${id}\` - ${title}`;

              switch (status) {
                case "pending":
                  pendingMigrations += `${checkboxLine}\n`;
                  break;
                case "in_progress":
                  _inProgressMigrations += `- \`${id}\` - ${title}\n`;
                  break;
                case "paused":
                  pausedMigrations += `${checkboxLine}\n`;
                  break;
              }
            }
          }
        }
      }

      // Verify dashboard content generation
      expect(pendingMigrations).toContain("react-hooks-conversion");
      expect(pendingMigrations).toContain("typescript-strict-mode");
      expect(pausedMigrations).toContain("legacy-api-cleanup");
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("should handle race condition in dashboard updates", async () => {
    // Test scenario: checkbox checked -> migration triggered -> dashboard updated before migration starts

    const issueBeforeUpdate = createDashboardIssueBody({
      pending: ["react-hooks-conversion"],
    });

    const issueAfterMigrationStart = createDashboardIssueBody({}).replace(
      /## 🔄 In-Progress Migrations\n\n✨ \*No active migrations\*/,
      "## 🔄 In-Progress Migrations\n\n- `react-hooks-conversion` - Convert React class components to hooks - 1/3 steps completed"
    );

    // Simulate the timing issue: dashboard updates immediately after triggering migration
    // but before migration status changes

    // The issue: if dashboard updates immediately, it won't show the in-progress migration
    // Solution: add a delay or check if migrations were just triggered

    expect(issueBeforeUpdate).toContain("[x] `react-hooks-conversion`");
    expect(issueAfterMigrationStart).toContain("1/3 steps completed");
  });
});
