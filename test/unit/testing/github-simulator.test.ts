import { describe, expect, it, beforeEach } from "vitest";
import { GitHubSimulator } from "../../../src/testing/github-simulator.js";

describe("GitHubSimulator", () => {
  let sim: GitHubSimulator;

  beforeEach(() => {
    sim = new GitHubSimulator();
  });

  // -------------------------------------------------------------------------
  // Convenience methods
  // -------------------------------------------------------------------------

  describe("context()", () => {
    it("returns a ContextWithRepository with correct owner/repo", () => {
      const ctx = sim.context("my-org", "my-repo");
      expect(ctx.payload.repository.owner.login).toBe("my-org");
      expect(ctx.payload.repository.name).toBe("my-repo");
      expect(ctx.payload.repository.full_name).toBe("my-org/my-repo");
    });

    it("defaults to test-owner/test-repo", () => {
      const ctx = sim.context();
      expect(ctx.payload.repository.owner.login).toBe("test-owner");
      expect(ctx.payload.repository.name).toBe("test-repo");
    });
  });

  describe("addMigrationFile()", () => {
    it("creates a v1 migration file with frontmatter", () => {
      sim.addMigrationFile("my-migration", {
        title: "My Migration",
        agent: "cursor",
        totalSteps: 3,
      });
      const content = sim.getFile(".hachiko/migrations/my-migration.md");
      expect(content).toBeDefined();
      expect(content).toContain("schema_version: 1");
      expect(content).toContain("id: my-migration");
      expect(content).toContain("total_steps: 3");
      expect(content).toContain("agent: cursor");
    });

    it("creates a v2 migration file", () => {
      sim.addMigrationFile("v2-migration", {
        title: "V2 Migration",
        agent: "devin",
        schemaVersion: 2,
      });
      const content = sim.getFile(".hachiko/migrations/v2-migration.md");
      expect(content).toContain("schema_version: 2");
      expect(content).not.toContain("total_steps");
      expect(content).not.toContain("status:");
    });
  });

  describe("createPR() / mergePR() / closePR()", () => {
    it("creates a PR in open state", () => {
      const pr = sim.createPR({ branch: "hachiko/test", title: "Test PR" });
      expect(pr.state).toBe("open");
      expect(pr.merged).toBe(false);
      expect(pr.merged_at).toBeNull();
    });

    it("mergePR sets state=closed, merged=true", () => {
      const pr = sim.createPR({ branch: "hachiko/test", title: "Test PR" });
      sim.mergePR(pr.number);
      const updated = sim.pullRequests.get(pr.number)!;
      expect(updated.state).toBe("closed");
      expect(updated.merged).toBe(true);
      expect(updated.merged_at).toBeTruthy();
    });

    it("closePR sets state=closed without merging", () => {
      const pr = sim.createPR({ branch: "hachiko/test", title: "Test PR" });
      sim.closePR(pr.number);
      const updated = sim.pullRequests.get(pr.number)!;
      expect(updated.state).toBe("closed");
      expect(updated.merged).toBe(false);
    });

    it("throws on invalid PR number", () => {
      expect(() => sim.mergePR(999)).toThrow("PR #999 not found");
      expect(() => sim.closePR(999)).toThrow("PR #999 not found");
    });
  });

  describe("createDashboardIssue()", () => {
    it("creates an issue with the dashboard label", () => {
      const issue = sim.createDashboardIssue("## Dashboard\n- Migration A");
      expect(issue.labels).toContain("hachiko:migration-dashboard");
      expect(issue.body).toContain("Migration A");
      expect(issue.state).toBe("open");
    });
  });

  // -------------------------------------------------------------------------
  // Octokit-compatible surface: issues
  // -------------------------------------------------------------------------

  describe("octokit.issues", () => {
    it("create → get round-trips", async () => {
      const ctx = sim.context();
      const created = await ctx.octokit.issues.create({
        owner: "o",
        repo: "r",
        title: "Bug report",
        body: "Broken",
        labels: ["bug"],
      });
      expect(created.data.number).toBeGreaterThan(0);

      const fetched = await ctx.octokit.issues.get({
        owner: "o",
        repo: "r",
        issue_number: created.data.number,
      });
      expect(fetched.data.title).toBe("Bug report");
      expect(fetched.data.body).toBe("Broken");
    });

    it("update modifies issue fields", async () => {
      const ctx = sim.context();
      const { data } = await ctx.octokit.issues.create({
        owner: "o",
        repo: "r",
        title: "Original",
      });
      await ctx.octokit.issues.update({
        owner: "o",
        repo: "r",
        issue_number: data.number,
        body: "Updated body",
        labels: ["new-label"],
      });
      const fetched = await ctx.octokit.issues.get({
        owner: "o",
        repo: "r",
        issue_number: data.number,
      });
      expect(fetched.data.body).toBe("Updated body");
      expect(fetched.data.labels).toEqual([{ name: "new-label" }]);
    });

    it("listForRepo filters by labels", async () => {
      const ctx = sim.context();
      await ctx.octokit.issues.create({ owner: "o", repo: "r", title: "A", labels: ["bug"] });
      await ctx.octokit.issues.create({ owner: "o", repo: "r", title: "B", labels: ["feature"] });

      const { data } = await ctx.octokit.issues.listForRepo({
        owner: "o",
        repo: "r",
        labels: "bug",
      });
      expect(data).toHaveLength(1);
      expect(data[0]!.title).toBe("A");
    });

    it("addLabels appends labels to a PR", async () => {
      const pr = sim.createPR({ branch: "b", title: "T", labels: ["existing"] });
      const ctx = sim.context();
      await ctx.octokit.issues.addLabels({
        owner: "o",
        repo: "r",
        issue_number: pr.number,
        labels: ["new-label"],
      });
      expect(sim.pullRequests.get(pr.number)!.labels).toEqual(["existing", "new-label"]);
    });

    it("addLabels deduplicates", async () => {
      const pr = sim.createPR({ branch: "b", title: "T", labels: ["a"] });
      const ctx = sim.context();
      await ctx.octokit.issues.addLabels({
        owner: "o",
        repo: "r",
        issue_number: pr.number,
        labels: ["a", "b"],
      });
      expect(sim.pullRequests.get(pr.number)!.labels).toEqual(["a", "b"]);
    });

    it("createComment appends to issue comments", async () => {
      const issue = sim.createDashboardIssue("body");
      const ctx = sim.context();
      await ctx.octokit.issues.createComment({
        owner: "o",
        repo: "r",
        issue_number: issue.number,
        body: "LGTM",
      });
      expect(sim.issues.get(issue.number)!.comments).toHaveLength(1);
      expect(sim.issues.get(issue.number)!.comments[0]!.body).toBe("LGTM");
    });

    it("get throws 404 for missing issue", async () => {
      const ctx = sim.context();
      await expect(
        ctx.octokit.issues.get({ owner: "o", repo: "r", issue_number: 999 })
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  // -------------------------------------------------------------------------
  // Octokit-compatible surface: pulls
  // -------------------------------------------------------------------------

  describe("octokit.pulls", () => {
    it("list filters by state", async () => {
      sim.createPR({ branch: "a", title: "Open" });
      const pr2 = sim.createPR({ branch: "b", title: "Closed" });
      sim.closePR(pr2.number);

      const ctx = sim.context();
      const { data: openPRs } = await ctx.octokit.pulls.list({
        owner: "o",
        repo: "r",
        state: "open",
      });
      expect(openPRs).toHaveLength(1);
      expect(openPRs[0]!.title).toBe("Open");

      const { data: allPRs } = await ctx.octokit.pulls.list({
        owner: "o",
        repo: "r",
        state: "all",
      });
      expect(allPRs).toHaveLength(2);
    });

    it("list returns head.ref and labels", async () => {
      sim.createPR({
        branch: "hachiko/my-migration-step-1",
        title: "Step 1",
        labels: ["hachiko:migration"],
      });
      const ctx = sim.context();
      const { data } = await ctx.octokit.pulls.list({ owner: "o", repo: "r", state: "open" });
      expect(data[0]!.head.ref).toBe("hachiko/my-migration-step-1");
      expect(data[0]!.labels[0]!.name).toBe("hachiko:migration");
    });

    it("list returns merged_at for merged PRs", async () => {
      const pr = sim.createPR({ branch: "a", title: "T" });
      sim.mergePR(pr.number);
      const ctx = sim.context();
      const { data } = await ctx.octokit.pulls.list({ owner: "o", repo: "r", state: "closed" });
      expect(data[0]!.merged_at).toBeTruthy();
    });

    it("listCommits returns commits from the PR", async () => {
      sim.createPR({
        branch: "b",
        title: "T",
        commits: [
          { sha: "abc", message: "hachiko-track:my-id:1 first" },
          { sha: "def", message: "second commit" },
        ],
      });
      const ctx = sim.context();
      const pr = sim.pullRequests.values().next().value!;
      const { data } = await ctx.octokit.pulls.listCommits({
        owner: "o",
        repo: "r",
        pull_number: pr.number,
      });
      expect(data).toHaveLength(2);
      expect(data[0]!.sha).toBe("abc");
      expect(data[0]!.commit.message).toBe("hachiko-track:my-id:1 first");
    });

    it("get throws 404 for missing PR", async () => {
      const ctx = sim.context();
      await expect(
        ctx.octokit.pulls.get({ owner: "o", repo: "r", pull_number: 999 })
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  // -------------------------------------------------------------------------
  // Octokit-compatible surface: repos
  // -------------------------------------------------------------------------

  describe("octokit.repos", () => {
    it("getContent returns base64-encoded file content", async () => {
      sim.setFile("foo.txt", "hello world");
      const ctx = sim.context();
      const { data } = await ctx.octokit.repos.getContent({
        owner: "o",
        repo: "r",
        path: "foo.txt",
      });
      expect(data.type).toBe("file");
      const decoded = Buffer.from(data.content, "base64").toString("utf-8");
      expect(decoded).toBe("hello world");
    });

    it("getContent throws 404 for missing file", async () => {
      const ctx = sim.context();
      await expect(
        ctx.octokit.repos.getContent({ owner: "o", repo: "r", path: "missing.txt" })
      ).rejects.toMatchObject({ status: 404 });
    });

    it("createOrUpdateFileContents writes base64 content to file store", async () => {
      const ctx = sim.context();
      await ctx.octokit.repos.createOrUpdateFileContents({
        owner: "o",
        repo: "r",
        path: "new-file.txt",
        message: "add file",
        content: Buffer.from("new content").toString("base64"),
      });
      expect(sim.getFile("new-file.txt")).toBe("new content");
    });

    it("listCommits returns synthetic commit", async () => {
      const ctx = sim.context();
      const { data } = await ctx.octokit.repos.listCommits({
        owner: "o",
        repo: "r",
        path: "some/file.ts",
      });
      expect(data).toHaveLength(1);
      expect(data[0]!.sha).toContain("commit-sha");
    });
  });

  // -------------------------------------------------------------------------
  // Octokit-compatible surface: actions
  // -------------------------------------------------------------------------

  describe("octokit.actions", () => {
    it("createWorkflowDispatch records dispatch", async () => {
      const ctx = sim.context();
      await ctx.octokit.actions.createWorkflowDispatch({
        owner: "o",
        repo: "r",
        workflow_id: "execute-migration.yml",
        ref: "main",
        inputs: { migration_id: "test" },
      });
      expect(sim.workflowDispatches).toHaveLength(1);
      expect(sim.workflowDispatches[0]!.workflow).toBe("execute-migration.yml");
      expect(sim.workflowDispatches[0]!.inputs.migration_id).toBe("test");
    });

    it("listWorkflowRuns filters by workflow and status", async () => {
      sim.addWorkflowRun({
        workflow_id: "execute-migration.yml",
        name: "Execute Migration",
        status: "in_progress",
        conclusion: null,
        head_branch: "main",
        created_at: new Date().toISOString(),
      });
      sim.addWorkflowRun({
        workflow_id: "execute-migration.yml",
        name: "Execute Migration",
        status: "completed",
        conclusion: "success",
        head_branch: "main",
        created_at: new Date().toISOString(),
      });
      sim.addWorkflowRun({
        workflow_id: "other.yml",
        name: "Other",
        status: "in_progress",
        conclusion: null,
        head_branch: "main",
        created_at: new Date().toISOString(),
      });

      const ctx = sim.context();
      const { data } = await ctx.octokit.actions.listWorkflowRuns({
        owner: "o",
        repo: "r",
        workflow_id: "execute-migration.yml",
        status: "in_progress",
      });
      expect(data.total_count).toBe(1);
      expect(data.workflow_runs).toHaveLength(1);
      expect(data.workflow_runs[0]!.status).toBe("in_progress");
    });
  });

  // -------------------------------------------------------------------------
  // Integration: simulator works with pr-detection types
  // -------------------------------------------------------------------------

  describe("compatibility with pr-detection PullRequest type", () => {
    it("serialized PRs match the PullRequest interface shape", async () => {
      sim.createPR({
        branch: "hachiko/my-migration-step-1",
        title: "[my-migration] Step 1",
        labels: ["hachiko:migration"],
      });
      const ctx = sim.context();
      const { data } = await ctx.octokit.pulls.list({ owner: "o", repo: "r", state: "open" });
      const pr = data[0]!;

      // These are the fields pr-detection.ts reads
      expect(pr).toHaveProperty("number");
      expect(pr).toHaveProperty("title");
      expect(pr).toHaveProperty("state");
      expect(pr).toHaveProperty("head.ref");
      expect(pr).toHaveProperty("html_url");
      expect(pr).toHaveProperty("merged_at");
      expect(pr.labels[0]).toHaveProperty("name");
    });
  });
});
