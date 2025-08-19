import { beforeEach, describe, expect, it, vi } from "vitest"
import { handlePush } from "../../../src/webhooks/push.js"
import { createTestLogger, loadFixture, loadJsonFixture } from "../../helpers/test-utils.js"
import { createMockContext, mockGitHubResponses, mockRepository } from "../../mocks/github.js"

describe("handlePush webhook", () => {
  let mockContext: any
  let mockOctokit: any
  let logger: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockOctokit = {
      repos: {
        getContent: vi.fn(),
      },
      issues: {
        create: vi.fn(),
      },
    }

    logger = createTestLogger()
  })

  it("should ignore pushes to non-default branches", async () => {
    const payload = {
      ...loadJsonFixture("payloads/push-event.json"),
      ref: "refs/heads/feature-branch",
    }

    mockContext = createMockContext("push", payload, mockOctokit)

    await handlePush(mockContext, logger)

    expect(mockOctokit.repos.getContent).not.toHaveBeenCalled()
    expect(mockOctokit.issues.create).not.toHaveBeenCalled()

    const logs = logger.getLogs()
    expect(logs.some((log) => log.message.includes("Ignoring push to non-default branch"))).toBe(
      true
    )
  })

  it("should process pushes to default branch", async () => {
    const payload = loadJsonFixture("payloads/push-event.json")
    mockContext = createMockContext("push", payload, mockOctokit)

    await handlePush(mockContext, logger)

    const logs = logger.getLogs()
    expect(logs.some((log) => log.message.includes("Processing push to default branch"))).toBe(true)
  })

  it("should discover and process new migration plans", async () => {
    const payload = {
      ...loadJsonFixture("payloads/push-event.json"),
      head_commit: {
        ...loadJsonFixture("payloads/push-event.json").head_commit,
        added: ["migrations/new-migration.md"],
      },
    }

    mockContext = createMockContext("push", payload, mockOctokit)

    // Mock the configuration file
    const configContent = loadFixture("configs/valid-hachiko-config.yml")
    mockOctokit.repos.getContent
      .mockResolvedValueOnce(mockGitHubResponses.getContent.file(configContent))
      .mockResolvedValueOnce(
        mockGitHubResponses.getContent.file(loadFixture("migration-plans/valid-plan.md"))
      )

    // Mock issue creation
    mockOctokit.issues.create.mockResolvedValue(mockGitHubResponses.createIssue(123))

    await handlePush(mockContext, logger)

    expect(mockOctokit.repos.getContent).toHaveBeenCalledWith({
      owner: "test-org",
      repo: "test-repo",
      path: ".hachiko.yml",
    })

    expect(mockOctokit.repos.getContent).toHaveBeenCalledWith({
      owner: "test-org",
      repo: "test-repo",
      path: "migrations/new-migration.md",
      ref: expect.any(String),
    })

    expect(mockOctokit.issues.create).toHaveBeenCalledWith({
      owner: "test-org",
      repo: "test-repo",
      title: "[Migration] Test Migration",
      body: expect.stringContaining("**Plan ID**: `test-migration`"),
      labels: expect.arrayContaining(["hachiko", "migration"]),
    })
  })

  it("should handle missing .hachiko.yml by using defaults", async () => {
    const payload = {
      ...loadJsonFixture("payloads/push-event.json"),
      head_commit: {
        ...loadJsonFixture("payloads/push-event.json").head_commit,
        added: ["migrations/new-migration.md"],
      },
    }

    mockContext = createMockContext("push", payload, mockOctokit)

    // Mock 404 for config file
    mockOctokit.repos.getContent
      .mockRejectedValueOnce(mockGitHubResponses.getContent.notFound())
      .mockResolvedValueOnce(
        mockGitHubResponses.getContent.file(loadFixture("migration-plans/valid-plan.md"))
      )

    mockOctokit.issues.create.mockResolvedValue(mockGitHubResponses.createIssue(123))

    await handlePush(mockContext, logger)

    expect(mockOctokit.issues.create).toHaveBeenCalled()

    const logs = logger.getLogs()
    expect(logs.some((log) => log.message.includes("No .hachiko.yml found"))).toBe(true)
  })

  it("should handle invalid migration plan files", async () => {
    const payload = {
      ...loadJsonFixture("payloads/push-event.json"),
      head_commit: {
        ...loadJsonFixture("payloads/push-event.json").head_commit,
        added: ["migrations/invalid-plan.md"],
      },
    }

    mockContext = createMockContext("push", payload, mockOctokit)

    // Mock config and invalid plan
    const configContent = loadFixture("configs/valid-hachiko-config.yml")
    mockOctokit.repos.getContent
      .mockResolvedValueOnce(mockGitHubResponses.getContent.file(configContent))
      .mockResolvedValueOnce(
        mockGitHubResponses.getContent.file("# Invalid plan without frontmatter")
      )

    await handlePush(mockContext, logger)

    expect(mockOctokit.issues.create).not.toHaveBeenCalled()

    const logs = logger.getLogs()
    expect(logs.some((log) => log.level === "error")).toBe(true)
  })

  it("should only process files in the configured plans directory", async () => {
    const payload = {
      ...loadJsonFixture("payloads/push-event.json"),
      head_commit: {
        ...loadJsonFixture("payloads/push-event.json").head_commit,
        added: ["docs/not-a-migration.md", "src/code.ts"],
      },
    }

    mockContext = createMockContext("push", payload, mockOctokit)

    // Mock config file
    const configContent = loadFixture("configs/valid-hachiko-config.yml")
    mockOctokit.repos.getContent.mockResolvedValueOnce(
      mockGitHubResponses.getContent.file(configContent)
    )

    await handlePush(mockContext, logger)

    // Should not try to process the non-migration files
    expect(mockOctokit.repos.getContent).toHaveBeenCalledTimes(1) // Only .hachiko.yml
    expect(mockOctokit.issues.create).not.toHaveBeenCalled()
  })

  it("should handle GitHub API errors gracefully", async () => {
    const payload = {
      ...loadJsonFixture("payloads/push-event.json"),
      head_commit: {
        ...loadJsonFixture("payloads/push-event.json").head_commit,
        added: ["migrations/new-migration.md"],
      },
    }

    mockContext = createMockContext("push", payload, mockOctokit)

    // Mock config loading to succeed but plan loading to fail
    const configContent = loadFixture("configs/valid-hachiko-config.yml")
    mockOctokit.repos.getContent
      .mockResolvedValueOnce(mockGitHubResponses.getContent.file(configContent))
      .mockRejectedValueOnce(new Error("API Error"))

    await expect(handlePush(mockContext, logger)).rejects.toThrow("API Error")

    const logs = logger.getLogs()
    expect(logs.some((log) => log.level === "error")).toBe(true)
  })
})
