import { describe, it, expect, vi, beforeEach } from "vitest"
import { promises as fs } from "node:fs"
import { join } from "node:path"

// Mock the logger before importing modules that use it
vi.mock("../../../src/utils/logger.js", () => ({
  createLogger: () => ({
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
  }),
}))

import { 
  parsePlanFile, 
  validatePlanFrontmatter, 
  discoverPlans,
  generateNormalizedFrontmatter,
  serializeFrontmatter
} from "../../../src/services/plans.js"
import { testConfig, loadFixture } from "../../helpers/test-utils.js"

// Mock fs module
vi.mock("node:fs", () => ({
  promises: {
    writeFile: vi.fn(),
    unlink: vi.fn(),
  },
}))

describe("parsePlanFile", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should parse a valid migration plan file", async () => {
    const planContent = loadFixture("migration-plans/valid-plan.md")
    const tempPath = "/tmp/test-plan.md"
    
    vi.mocked(fs.writeFile).mockResolvedValue(undefined)
    vi.mocked(fs.unlink).mockResolvedValue(undefined)

    const result = await parsePlanFile(planContent, tempPath)

    expect(result.isValid).toBe(true)
    expect(result.plan?.id).toBe("test-migration")
    expect(result.plan?.frontmatter.title).toBe("Test Migration")
    expect(result.plan?.frontmatter.steps).toHaveLength(2)
    expect(result.plan?.frontmatter.steps[0]?.id).toBe("step-1")
    expect(result.plan?.content).toContain("# Test Migration")
  })

  it("should handle files without frontmatter", async () => {
    const planContent = "# Just a markdown file\n\nNo frontmatter here."
    const tempPath = "/tmp/test-plan.md"
    
    vi.mocked(fs.writeFile).mockResolvedValue(undefined)
    vi.mocked(fs.unlink).mockResolvedValue(undefined)

    const result = await parsePlanFile(planContent, tempPath)

    expect(result.isValid).toBe(false)
    expect(result.errors).toContain("No frontmatter found")
  })

  it("should validate required frontmatter fields", async () => {
    const planContent = `---
title: Missing ID
---
# Plan without ID`
    const tempPath = "/tmp/test-plan.md"
    
    vi.mocked(fs.writeFile).mockResolvedValue(undefined)
    vi.mocked(fs.unlink).mockResolvedValue(undefined)

    const result = await parsePlanFile(planContent, tempPath)

    expect(result.isValid).toBe(false)
    expect(result.errors.some(error => error.includes("id"))).toBe(true)
  })

  it("should clean up temporary files even on error", async () => {
    const planContent = "invalid frontmatter ---"
    const tempPath = "/tmp/test-plan.md"
    
    vi.mocked(fs.writeFile).mockRejectedValue(new Error("Write failed"))

    const result = await parsePlanFile(planContent, tempPath)

    expect(result.isValid).toBe(false)
    expect(vi.mocked(fs.unlink)).toHaveBeenCalledWith(tempPath)
  })
})

describe("validatePlanFrontmatter", () => {
  it("should validate correct frontmatter", () => {
    const frontmatter = {
      id: "test-migration",
      title: "Test Migration",
      description: "A test migration",
      owner: "test-team",
      agent: "claude",
      status: "draft",
      dependsOn: [],
      strategy: {
        chunkBy: "directory",
        maxOpenPRs: 2,
      },
      steps: [
        {
          id: "step-1",
          description: "First step",
          prompt: "Do something",
        },
      ],
    }

    const result = validatePlanFrontmatter(frontmatter)
    expect(result.isValid).toBe(true)
    expect(result.frontmatter?.id).toBe("test-migration")
  })

  it("should reject frontmatter with missing required fields", () => {
    const frontmatter = {
      title: "Missing ID",
    }

    const result = validatePlanFrontmatter(frontmatter)
    expect(result.isValid).toBe(false)
    expect(result.errors.some(error => error.includes("id"))).toBe(true)
  })

  it("should reject invalid status values", () => {
    const frontmatter = {
      id: "test",
      title: "Test",
      status: "invalid-status",
    }

    const result = validatePlanFrontmatter(frontmatter)
    expect(result.isValid).toBe(false)
  })

  it("should reject empty steps array", () => {
    const frontmatter = {
      id: "test",
      title: "Test",
      steps: [],
    }

    const result = validatePlanFrontmatter(frontmatter)
    expect(result.isValid).toBe(false)
  })

  it("should validate step structure", () => {
    const frontmatter = {
      id: "test",
      title: "Test",
      steps: [
        {
          id: "step-1",
          description: "First step",
          // Missing prompt
        },
      ],
    }

    const result = validatePlanFrontmatter(frontmatter)
    expect(result.isValid).toBe(false)
  })
})

describe("discoverPlans", () => {
  it("should discover plans in the configured directory", async () => {
    const mockGlob = vi.fn().mockResolvedValue([
      "migrations/plan1.md",
      "migrations/subdir/plan2.md",
    ])

    // Mock glob import
    vi.doMock("glob", () => ({ glob: mockGlob }))
    
    const { discoverPlans: discoverPlansImport } = await import("../../../src/services/plans.js")
    const result = await discoverPlansImport(testConfig)

    expect(result).toEqual([
      "migrations/plan1.md",
      "migrations/subdir/plan2.md",
    ])
    expect(mockGlob).toHaveBeenCalledWith("migrations/**/*.md")
  })

  it("should handle multiple file extensions", async () => {
    const config = {
      ...testConfig,
      plans: {
        directory: "plans",
        extensions: [".md", ".markdown"],
      },
    }

    const mockGlob = vi.fn().mockResolvedValue([
      "plans/plan1.md",
      "plans/plan2.markdown",
    ])

    vi.doMock("glob", () => ({ glob: mockGlob }))
    
    const { discoverPlans: discoverPlansImport } = await import("../../../src/services/plans.js")
    const result = await discoverPlansImport(config)

    expect(result).toEqual([
      "plans/plan1.md",
      "plans/plan2.markdown",
    ])
  })
})

describe("generateNormalizedFrontmatter", () => {
  it("should apply config defaults to frontmatter", () => {
    const frontmatter = {
      id: "test-migration",
      title: "Test Migration",
      steps: [
        {
          id: "step-1",
          description: "First step",
          prompt: "Do something",
        },
      ],
    }

    const result = generateNormalizedFrontmatter(frontmatter, testConfig)

    expect(result.agent).toBe("claude")
    expect(result.strategy.chunkBy).toBe("directory")
    expect(result.strategy.maxOpenPRs).toBe(3)
    expect(result.status).toBe("draft")
  })

  it("should preserve existing frontmatter values", () => {
    const frontmatter = {
      id: "test-migration",
      title: "Test Migration",
      agent: "custom-agent",
      strategy: {
        chunkBy: "file" as const,
        maxOpenPRs: 1,
      },
      steps: [
        {
          id: "step-1",
          description: "First step",
          prompt: "Do something",
        },
      ],
    }

    const result = generateNormalizedFrontmatter(frontmatter, testConfig)

    expect(result.agent).toBe("custom-agent")
    expect(result.strategy.chunkBy).toBe("file")
    expect(result.strategy.maxOpenPRs).toBe(1)
  })
})

describe("serializeFrontmatter", () => {
  it("should serialize frontmatter to YAML", () => {
    const frontmatter = {
      id: "test-migration",
      title: "Test Migration",
      agent: "claude",
      steps: [
        {
          id: "step-1",
          description: "First step",
          prompt: "Do something",
        },
      ],
    }

    const result = serializeFrontmatter(frontmatter)

    expect(result).toContain("id: test-migration")
    expect(result).toContain("title: Test Migration")
    expect(result).toContain("agent: claude")
    expect(result).toContain("- id: step-1")
  })

  it("should handle complex nested objects", () => {
    const frontmatter = {
      id: "test",
      strategy: {
        chunkBy: "directory" as const,
        maxOpenPRs: 3,
      },
      steps: [],
    }

    const result = serializeFrontmatter(frontmatter)

    expect(result).toContain("strategy:")
    expect(result).toContain("chunkBy: directory")
    expect(result).toContain("maxOpenPRs: 3")
  })
})
