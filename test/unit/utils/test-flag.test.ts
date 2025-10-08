import type LaunchDarklyClient from "@launchdarkly/node-server-sdk"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FeatureFlagService } from "../../../src/services/feature-flags.js"
import { isTestFlagEnabled, testFlagExample } from "../../../src/utils/test-flag.js"

// Mock the LaunchDarkly SDK
vi.mock("@launchdarkly/node-server-sdk", () => {
  const mockClient = {
    waitForInitialization: vi.fn().mockResolvedValue(undefined),
    variation: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  }

  return {
    default: {
      init: vi.fn(() => mockClient),
    },
  }
})

describe("test-flag utilities", () => {
  let originalEnv: NodeJS.ProcessEnv
  const testContext: LaunchDarklyClient.LDContext = {
    kind: "user",
    key: "test-user",
  }

  beforeEach(() => {
    originalEnv = process.env
    process.env = { ...originalEnv }
    // Reset the singleton instance
    // @ts-ignore - accessing private property for testing
    FeatureFlagService.instance = null
  })

  afterEach(async () => {
    process.env = originalEnv
    const service = FeatureFlagService.getInstance()
    await service.close()
    vi.clearAllMocks()
  })

  describe("isTestFlagEnabled", () => {
    it("should return false when flag is disabled", async () => {
      process.env.LAUNCHDARKLY_SDK_KEY = "test-sdk-key"
      process.env.NODE_ENV = "test"

      const LaunchDarkly = await import("@launchdarkly/node-server-sdk")
      const mockClient = LaunchDarkly.default.init("test-key")
      vi.mocked(mockClient.variation).mockResolvedValue(false)

      const service = FeatureFlagService.getInstance()
      await service.initialize()

      const result = await isTestFlagEnabled(testContext)
      expect(result).toBe(false)
    })

    it("should return true when flag is enabled", async () => {
      process.env.LAUNCHDARKLY_SDK_KEY = "test-sdk-key"
      process.env.NODE_ENV = "test"

      const LaunchDarkly = await import("@launchdarkly/node-server-sdk")
      const mockClient = LaunchDarkly.default.init("test-key")
      vi.mocked(mockClient.variation).mockResolvedValue(true)

      const service = FeatureFlagService.getInstance()
      await service.initialize()

      const result = await isTestFlagEnabled(testContext)
      expect(result).toBe(true)
    })

    it("should return false when service is not initialized", async () => {
      const result = await isTestFlagEnabled(testContext)
      expect(result).toBe(false)
    })
  })

  describe("testFlagExample", () => {
    it("should execute noop when flag is enabled", async () => {
      process.env.LAUNCHDARKLY_SDK_KEY = "test-sdk-key"
      process.env.NODE_ENV = "test"

      const LaunchDarkly = await import("@launchdarkly/node-server-sdk")
      const mockClient = LaunchDarkly.default.init("test-key")
      vi.mocked(mockClient.variation).mockResolvedValue(true)

      const service = FeatureFlagService.getInstance()
      await service.initialize()

      // Should not throw
      await testFlagExample(testContext)
    })

    it("should skip noop when flag is disabled", async () => {
      process.env.LAUNCHDARKLY_SDK_KEY = "test-sdk-key"
      process.env.NODE_ENV = "test"

      const LaunchDarkly = await import("@launchdarkly/node-server-sdk")
      const mockClient = LaunchDarkly.default.init("test-key")
      vi.mocked(mockClient.variation).mockResolvedValue(false)

      const service = FeatureFlagService.getInstance()
      await service.initialize()

      // Should not throw
      await testFlagExample(testContext)
    })

    it("should work when service is not initialized", async () => {
      // Should not throw
      await testFlagExample(testContext)
    })
  })
})
