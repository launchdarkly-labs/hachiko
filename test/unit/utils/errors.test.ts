import { describe, expect, it, vi } from "vitest"
import {
  AgentExecutionError,
  ConfigurationError,
  GitHubApiError,
  HachikoError,
  MigrationStateError,
  PolicyViolationError,
  formatErrorForIssue,
  isHachikoError,
  withRetry,
} from "../../../src/utils/errors.js"

describe("HachikoError", () => {
  it("should create a basic error", () => {
    const error = new HachikoError("Test error", "TEST_ERROR")

    expect(error.message).toBe("Test error")
    expect(error.code).toBe("TEST_ERROR")
    expect(error.name).toBe("HachikoError")
    expect(error.details).toBeUndefined()
  })

  it("should create an error with details", () => {
    const details = { planId: "test", stepId: "step-1" }
    const error = new HachikoError("Test error", "TEST_ERROR", details)

    expect(error.message).toBe("Test error")
    expect(error.code).toBe("TEST_ERROR")
    expect(error.details).toEqual(details)
  })
})

describe("ConfigurationError", () => {
  it("should create a configuration error", () => {
    const error = new ConfigurationError("Invalid config")

    expect(error.message).toBe("Invalid config")
    expect(error.code).toBe("CONFIGURATION_ERROR")
    expect(error.name).toBe("ConfigurationError")
  })

  it("should create a configuration error with details", () => {
    const details = { field: "agents.claude.command" }
    const error = new ConfigurationError("Missing command", details)

    expect(error.details).toEqual(details)
  })
})

describe("PolicyViolationError", () => {
  it("should create a policy violation error", () => {
    const violations = ["Accessing blocked path", "Using dangerous command"]
    const error = new PolicyViolationError("Policy violations detected", violations)

    expect(error.message).toBe("Policy violations detected")
    expect(error.code).toBe("POLICY_VIOLATION")
    expect(error.name).toBe("PolicyViolationError")
    expect(error.details).toEqual({ violations })
  })

  it("should merge additional details", () => {
    const violations = ["Test violation"]
    const additionalDetails = { planId: "test" }
    const error = new PolicyViolationError("Violation", violations, additionalDetails)

    expect(error.details).toEqual({ violations, planId: "test" })
  })
})

describe("AgentExecutionError", () => {
  it("should create an agent execution error", () => {
    const error = new AgentExecutionError("Agent failed", "claude-cli")

    expect(error.message).toBe("Agent failed")
    expect(error.code).toBe("AGENT_EXECUTION_ERROR")
    expect(error.name).toBe("AgentExecutionError")
    expect(error.details).toEqual({ agentName: "claude-cli" })
  })
})

describe("MigrationStateError", () => {
  it("should create a migration state error", () => {
    const error = new MigrationStateError("Invalid state", "test-plan", "running")

    expect(error.message).toBe("Invalid state")
    expect(error.code).toBe("MIGRATION_STATE_ERROR")
    expect(error.name).toBe("MigrationStateError")
    expect(error.details).toEqual({ planId: "test-plan", currentState: "running" })
  })
})

describe("GitHubApiError", () => {
  it("should create a GitHub API error", () => {
    const error = new GitHubApiError("API rate limit exceeded", 429)

    expect(error.message).toBe("API rate limit exceeded")
    expect(error.code).toBe("GITHUB_API_ERROR")
    expect(error.name).toBe("GitHubApiError")
    expect(error.details).toEqual({ status: 429 })
  })
})

describe("isHachikoError", () => {
  it("should identify Hachiko errors", () => {
    const hachikoError = new HachikoError("Test", "TEST")
    const configError = new ConfigurationError("Config test")
    const regularError = new Error("Regular error")

    expect(isHachikoError(hachikoError)).toBe(true)
    expect(isHachikoError(configError)).toBe(true)
    expect(isHachikoError(regularError)).toBe(false)
    expect(isHachikoError("string")).toBe(false)
    expect(isHachikoError(null)).toBe(false)
  })
})

describe("formatErrorForIssue", () => {
  it("should format a Hachiko error", () => {
    const error = new HachikoError("Test error", "TEST_ERROR", { planId: "test" })
    const formatted = formatErrorForIssue(error)

    expect(formatted).toContain("**HachikoError**: Test error")
    expect(formatted).toContain("**Details:**")
    expect(formatted).toContain('- planId: "test"')
    expect(formatted).toContain("**Code**: `TEST_ERROR`")
  })

  it("should format a Hachiko error without details", () => {
    const error = new ConfigurationError("Config error")
    const formatted = formatErrorForIssue(error)

    expect(formatted).toContain("**ConfigurationError**: Config error")
    expect(formatted).toContain("**Code**: `CONFIGURATION_ERROR`")
    expect(formatted).not.toContain("**Details:**")
  })

  it("should format a regular error", () => {
    const error = new Error("Regular error")
    error.stack = "Error: Regular error\n    at test.js:1:1"

    const formatted = formatErrorForIssue(error)

    expect(formatted).toContain("**Error**: Regular error")
    expect(formatted).toContain("```")
    expect(formatted).toContain("Error: Regular error")
  })
})

describe("withRetry", () => {
  it("should succeed on first attempt", async () => {
    const operation = vi.fn().mockResolvedValue("success")

    const result = await withRetry(operation)

    expect(result).toBe("success")
    expect(operation).toHaveBeenCalledTimes(1)
  })

  it("should retry on failure and succeed", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("First failure"))
      .mockResolvedValue("success")

    const result = await withRetry(operation, 3, 10)

    expect(result).toBe("success")
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it("should throw after max attempts", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("Always fails"))

    await expect(withRetry(operation, 2, 10)).rejects.toThrow("Always fails")
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it("should not retry policy violations", async () => {
    const operation = vi
      .fn()
      .mockRejectedValue(new PolicyViolationError("Policy violated", ["test"]))

    await expect(withRetry(operation, 3, 10)).rejects.toThrow("Policy violated")
    expect(operation).toHaveBeenCalledTimes(1)
  })

  it("should not retry configuration errors", async () => {
    const operation = vi.fn().mockRejectedValue(new ConfigurationError("Bad config"))

    await expect(withRetry(operation, 3, 10)).rejects.toThrow("Bad config")
    expect(operation).toHaveBeenCalledTimes(1)
  })

  it("should use exponential backoff", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("Fail 1"))
      .mockRejectedValueOnce(new Error("Fail 2"))
      .mockResolvedValue("success")

    const startTime = Date.now()
    const result = await withRetry(operation, 3, 50)
    const duration = Date.now() - startTime

    expect(result).toBe("success")
    expect(operation).toHaveBeenCalledTimes(3)
    // Should take at least 50ms + 100ms = 150ms due to backoff
    expect(duration).toBeGreaterThan(120)
  })
})
