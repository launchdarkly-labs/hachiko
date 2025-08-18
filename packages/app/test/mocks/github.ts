import type { Context } from "probot"
import { vi } from "vitest"

/**
 * Create a mock Octokit instance with all the methods we use
 */
export function createMockOctokit() {
  return {
    repos: {
      getContent: vi.fn(),
      getBranch: vi.fn(),
      createDispatchEvent: vi.fn(),
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
    },
    checks: {
      create: vi.fn(),
    },
    actions: {
      listJobsForWorkflowRun: vi.fn(),
    },
  }
}

/**
 * Create a mock Probot context for testing
 */
export function createMockContext<T extends string>(
  eventName: T,
  payload: any,
  octokit = createMockOctokit()
): Context<T> {
  return {
    id: "test-request-id",
    name: eventName,
    payload,
    octokit: octokit as any,
    log: {
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
    } as any,
    repo: vi.fn((params: any) => ({
      owner: payload.repository?.owner?.login || "test-owner",
      repo: payload.repository?.name || "test-repo",
      ...params,
    })),
    issue: vi.fn((params: any) => ({
      owner: payload.repository?.owner?.login || "test-owner",
      repo: payload.repository?.name || "test-repo",
      issue_number: payload.issue?.number || payload.pull_request?.number || 1,
      ...params,
    })),
    pullRequest: vi.fn((params: any) => ({
      owner: payload.repository?.owner?.login || "test-owner",
      repo: payload.repository?.name || "test-repo",
      pull_number: payload.pull_request?.number || 1,
      ...params,
    })),
  } as any
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
      const error = new Error("Not Found") as any
      error.status = 404
      throw error
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
}

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
}

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
}

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
}
