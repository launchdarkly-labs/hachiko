import { describe, it, expect } from "vitest"
import { 
  parseHachikoCommand, 
  canExecuteCommand, 
  formatCommandResponse 
} from "../../../src/utils/commands.js"

describe("parseHachikoCommand", () => {
  it("should parse a valid status command", () => {
    const result = parseHachikoCommand("/hachi status")
    
    expect(result).toEqual({
      action: "status",
      args: [],
      rawCommand: "/hachi status",
    })
  })

  it("should parse a command with arguments", () => {
    const result = parseHachikoCommand("/hachi retry step-1 --force")
    
    expect(result).toEqual({
      action: "retry",
      args: ["step-1", "--force"],
      rawCommand: "/hachi retry step-1 --force",
    })
  })

  it("should handle multiline comments and take first line", () => {
    const commentBody = `/hachi status
    
    Additional comment text here
    That should be ignored`
    
    const result = parseHachikoCommand(commentBody)
    
    expect(result).toEqual({
      action: "status",
      args: [],
      rawCommand: "/hachi status",
    })
  })

  it("should return null for non-hachi commands", () => {
    const result = parseHachikoCommand("This is just a regular comment")
    expect(result).toBeNull()
  })

  it("should return null for empty comments", () => {
    const result = parseHachikoCommand("")
    expect(result).toBeNull()
  })

  it("should return null for just /hachi without action", () => {
    const result = parseHachikoCommand("/hachi")
    expect(result).toBeNull()
  })

  it("should handle extra whitespace", () => {
    const result = parseHachikoCommand("  /hachi   status   arg1   arg2  ")
    
    expect(result).toEqual({
      action: "status",
      args: ["arg1", "arg2"],
      rawCommand: "/hachi   status   arg1   arg2",
    })
  })

  it("should handle commands that don't start with /hachi", () => {
    const result = parseHachikoCommand("Some text /hachi status")
    expect(result).toBeNull()
  })
})

describe("canExecuteCommand", () => {
  const mockCommand = {
    action: "retry",
    args: ["step-1"],
    rawCommand: "/hachi retry step-1",
  }

  const mockRepository = {
    owner: { login: "test-org" }
  }

  it("should allow status commands for anyone", () => {
    const statusCommand = { ...mockCommand, action: "status" }
    const user = { login: "anyone", type: "User" }
    
    const result = canExecuteCommand(statusCommand, user, mockRepository)
    expect(result).toBe(true)
  })

  it("should allow commands for regular users", () => {
    const user = { login: "test-user", type: "User" }
    
    const result = canExecuteCommand(mockCommand, user, mockRepository)
    expect(result).toBe(true)
  })

  it("should deny commands for bots", () => {
    const user = { login: "github-actions[bot]", type: "Bot" }
    
    const result = canExecuteCommand(mockCommand, user, mockRepository)
    expect(result).toBe(false)
  })

  it("should deny commands for users with empty login", () => {
    const user = { login: "", type: "User" }
    
    const result = canExecuteCommand(mockCommand, user, mockRepository)
    expect(result).toBe(false)
  })

  it("should allow status commands even for bots", () => {
    const statusCommand = { ...mockCommand, action: "status" }
    const user = { login: "github-actions[bot]", type: "Bot" }
    
    const result = canExecuteCommand(statusCommand, user, mockRepository)
    expect(result).toBe(true)
  })
})

describe("formatCommandResponse", () => {
  it("should format a success response", () => {
    const result = formatCommandResponse(
      "/hachi status",
      "success",
      "Migration is currently running step 2 of 5"
    )
    
    expect(result).toContain("✅")
    expect(result).toContain("**Command**: `/hachi status`")
    expect(result).toContain("Migration is currently running step 2 of 5")
  })

  it("should format an error response", () => {
    const result = formatCommandResponse(
      "/hachi retry step-1",
      "error",
      "Step step-1 is not in a retryable state"
    )
    
    expect(result).toContain("❌")
    expect(result).toContain("**Command**: `/hachi retry step-1`")
    expect(result).toContain("Step step-1 is not in a retryable state")
  })

  it("should format an info response", () => {
    const result = formatCommandResponse(
      "/hachi help",
      "info",
      "Available commands: status, retry, skip, pause, resume"
    )
    
    expect(result).toContain("ℹ️")
    expect(result).toContain("**Command**: `/hachi help`")
    expect(result).toContain("Available commands: status, retry, skip, pause, resume")
  })

  it("should include details when provided", () => {
    const result = formatCommandResponse(
      "/hachi status",
      "success",
      "Migration is running",
      "Current step: step-2\\nProgress: 40%\\nETA: 15 minutes"
    )
    
    expect(result).toContain("Migration is running")
    expect(result).toContain("**Details:**")
    expect(result).toContain("Current step: step-2")
    expect(result).toContain("Progress: 40%")
    expect(result).toContain("ETA: 15 minutes")
  })

  it("should work without details", () => {
    const result = formatCommandResponse(
      "/hachi status",
      "success",
      "Migration completed successfully"
    )
    
    expect(result).toContain("Migration completed successfully")
    expect(result).not.toContain("**Details:**")
  })
})
