import { vi } from "vitest";

/**
 * Create a mock Octokit instance with all the methods we use
 */
export function createMockOctokit() {
  return {
    repos: {
      getContent: vi.fn(),
      getBranch: vi.fn(),
      createDispatchEvent: vi.fn(),
      listCommits: vi.fn(),
    },
    issues: {
      create: vi.fn(),
      update: vi.fn(),
      addLabels: vi.fn(),
      createComment: vi.fn(),
      listForRepo: vi.fn(),
    },
    pulls: {
      create: vi.fn(),
      list: vi.fn(),
      listCommits: vi.fn(),
    },
    checks: {
      create: vi.fn(),
    },
    actions: {
      listJobsForWorkflowRun: vi.fn(),
    },
  };
}

/**
 * Common GitHub API response mocks
 */
export const mockGitHubResponses = {
  getContent: {
    file: (content: string) => ({
      data: {
        type: "file",
        content: Buffer.from(content).toString("base64"),
        encoding: "base64",
      },
    }),
    notFound: () => {
      const error = new Error("Not Found") as any;
      error.status = 404;
      throw error;
    },
  },

  listIssues: {
    empty: () => ({ data: [] }),
    withIssue: (issue: any) => ({ data: [issue] }),
  },

  createIssue: (issueNumber = 123) => ({
    data: {
      number: issueNumber,
      html_url: `https://github.com/test-owner/test-repo/issues/${issueNumber}`,
    },
  }),

  createPR: (prNumber = 456) => ({
    data: {
      number: prNumber,
      html_url: `https://github.com/test-owner/test-repo/pull/${prNumber}`,
    },
  }),

  getBranch: (sha = "abc123") => ({
    data: {
      commit: { sha },
    },
  }),

  listJobs: {
    success: () => ({
      data: {
        jobs: [
          {
            name: "test-job",
            conclusion: "success",
          },
        ],
      },
    }),
    failed: () => ({
      data: {
        jobs: [
          {
            name: "test-job",
            conclusion: "failure",
          },
        ],
      },
    }),
  },
};

/**
 * Mock repository data
 */
export const mockRepository = {
  id: 12345,
  name: "test-repo",
  full_name: "test-owner/test-repo",
  owner: {
    login: "test-owner",
  },
  default_branch: "main",
};

/**
 * Mock pull request data
 */
export const mockPullRequest = {
  number: 456,
  title: "Hachiko: test-migration - step-1",
  html_url: "https://github.com/test-owner/test-repo/pull/456",
  merged: false,
  merge_commit_sha: null,
  head: {
    ref: "hachi/test-migration/step-1",
  },
  labels: [
    { name: "hachiko" },
    { name: "migration" },
    { name: "hachiko:plan:test-migration" },
    { name: "hachiko:step:test-migration:step-1" },
  ],
};

/**
 * Mock workflow run data
 */
export const mockWorkflowRun = {
  id: 789,
  name: "Hachiko Agent Runner",
  conclusion: "success",
  html_url: "https://github.com/test-owner/test-repo/actions/runs/789",
  head_sha: "def456",
  head_branch: "hachi/test-migration/step-1",
  head_commit: {
    message: "Hachiko: test-migration - step-1",
  },
};
