import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  FeatureFlagService,
  createFeatureFlagService,
  initializeFeatureFlags,
} from "../../../src/services/feature-flags.js"
import { ConfigurationError } from "../../../src/utils/errors.js"

// Mock LaunchDarkly SDK
vi.mock("@launchdarkly/node-server-sdk", () => {
  const mockClient = {
    waitForInitialization: vi.fn().mockResolvedValue(undefined),
    variation: vi.fn().mockResolvedValue(false),
    close: vi.fn().mockResolvedValue(undefined),
  }

  return {
    default: {
      init: vi.fn().mockReturnValue(mockClient),
    },
  }
})

describe("FeatureFlagService", () => {
  let service: FeatureFlagService
  const originalEnv = process.env

  beforeEach(() => {
    // Reset singleton instance
    // @ts-expect-error - accessing private static field for testing
    FeatureFlagService.instance = null

    // Mock environment
    process.env = { ...originalEnv }
    process.env.NODE_ENV = "test"
  })

  afterEach(() => {
    process.env = originalEnv
    vi.clearAllMocks()
  })

  describe("getInstance", () => {
    it("should return singleton instance", () => {
      const instance1 = FeatureFlagService.getInstance()
      const instance2 = FeatureFlagService.getInstance()
      expect(instance1).toBe(instance2)
    })
  })

  describe("initialize", () => {
    it("should initialize with LaunchDarkly SDK key", async () => {
      process.env.LAUNCHDARKLY_SDK_KEY = "test-sdk-key"
      service = FeatureFlagService.getInstance()

      await service.initialize()

      const LaunchDarklyClient = await import("@launchdarkly/node-server-sdk")
      expect(LaunchDarklyClient.default.init).toHaveBeenCalledWith("test-sdk-key", {
        stream: true,
        offline: true,
      })
    })

    it("should handle missing SDK key gracefully", async () => {
      process.env.LAUNCHDARKLY_SDK_KEY = undefined
      service = FeatureFlagService.getInstance()

      await service.initialize()

      // Should not throw, just log warning and continue
      const LaunchDarklyClient = await import("@launchdarkly/node-server-sdk")
      expect(LaunchDarklyClient.default.init).not.toHaveBeenCalled()
    })

    it("should not reinitialize if already initialized", async () => {
      process.env.LAUNCHDARKLY_SDK_KEY = "test-sdk-key"
      service = FeatureFlagService.getInstance()

      await service.initialize()
      await service.initialize()

      const LaunchDarklyClient = await import("@launchdarkly/node-server-sdk")
      expect(LaunchDarklyClient.default.init).toHaveBeenCalledTimes(1)
    })

    it("should handle initialization errors", async () => {
      process.env.LAUNCHDARKLY_SDK_KEY = "test-sdk-key"
      service = FeatureFlagService.getInstance()

      const LaunchDarklyClient = await import("@launchdarkly/node-server-sdk")
      const mockClient = {
        waitForInitialization: vi.fn().mockRejectedValue(new Error("Init failed")),
        close: vi.fn(),
      }
      vi.mocked(LaunchDarklyClient.default.init).mockReturnValueOnce(mockClient as any)

      await expect(service.initialize()).rejects.toThrow(ConfigurationError)
    })
  })

  describe("isTestFlagEnabled", () => {
    beforeEach(async () => {
      process.env.LAUNCHDARKLY_SDK_KEY = "test-sdk-key"
      service = FeatureFlagService.getInstance()
      await service.initialize()
    })

    it("should return false when flag is disabled", async () => {
      const LaunchDarklyClient = await import("@launchdarkly/node-server-sdk")
      const mockClient = LaunchDarklyClient.default.init() as any
      mockClient.variation.mockResolvedValueOnce(false)

      const result = await service.isTestFlagEnabled("user123")

      expect(result).toBe(false)
      expect(mockClient.variation).toHaveBeenCalledWith("test-flag", { key: "user123" }, false)
    })

    it("should return true when flag is enabled", async () => {
      const LaunchDarklyClient = await import("@launchdarkly/node-server-sdk")
      const mockClient = LaunchDarklyClient.default.init() as any
      mockClient.variation.mockResolvedValueOnce(true)

      const result = await service.isTestFlagEnabled("user123")

      expect(result).toBe(true)
    })

    it("should use 'anonymous' as default user", async () => {
      const LaunchDarklyClient = await import("@launchdarkly/node-server-sdk")
      const mockClient = LaunchDarklyClient.default.init() as any
      mockClient.variation.mockResolvedValueOnce(false)

      await service.isTestFlagEnabled()

      expect(mockClient.variation).toHaveBeenCalledWith("test-flag", { key: "anonymous" }, false)
    })

    it("should throw if service not initialized", async () => {
      // Reset to get a fresh instance
      // @ts-expect-error - accessing private static field for testing
      FeatureFlagService.instance = null
      service = FeatureFlagService.getInstance()
      // Don't initialize

      await expect(service.isTestFlagEnabled()).rejects.toThrow(ConfigurationError)
    })

    it("should return false when LaunchDarkly client is not available", async () => {
      process.env.LAUNCHDARKLY_SDK_KEY = undefined
      service = FeatureFlagService.getInstance()
      await service.initialize()

      const result = await service.isTestFlagEnabled("user123")

      expect(result).toBe(false)
    })

    it("should handle evaluation errors gracefully", async () => {
      const LaunchDarklyClient = await import("@launchdarkly/node-server-sdk")
      const mockClient = LaunchDarklyClient.default.init() as any
      mockClient.variation.mockRejectedValueOnce(new Error("Evaluation failed"))

      const result = await service.isTestFlagEnabled("user123")

      expect(result).toBe(false)
    })
  })

  describe("executeTestFlagOperation", () => {
    beforeEach(async () => {
      process.env.LAUNCHDARKLY_SDK_KEY = "test-sdk-key"
      service = FeatureFlagService.getInstance()
      await service.initialize()
    })

    it("should execute when flag is enabled", async () => {
      const LaunchDarklyClient = await import("@launchdarkly/node-server-sdk")
      const mockClient = LaunchDarklyClient.default.init() as any
      mockClient.variation.mockResolvedValueOnce(true)

      await service.executeTestFlagOperation("user123")

      expect(mockClient.variation).toHaveBeenCalledWith("test-flag", { key: "user123" }, false)
    })

    it("should skip when flag is disabled", async () => {
      const LaunchDarklyClient = await import("@launchdarkly/node-server-sdk")
      const mockClient = LaunchDarklyClient.default.init() as any
      mockClient.variation.mockResolvedValueOnce(false)

      await service.executeTestFlagOperation("user123")

      expect(mockClient.variation).toHaveBeenCalledWith("test-flag", { key: "user123" }, false)
    })
  })

  describe("close", () => {
    it("should close LaunchDarkly client", async () => {
      process.env.LAUNCHDARKLY_SDK_KEY = "test-sdk-key"
      service = FeatureFlagService.getInstance()
      await service.initialize()

      await service.close()

      const LaunchDarklyClient = await import("@launchdarkly/node-server-sdk")
      const mockClient = LaunchDarklyClient.default.init() as any
      expect(mockClient.close).toHaveBeenCalled()
    })

    it("should handle close when client is null", async () => {
      service = FeatureFlagService.getInstance()

      await expect(service.close()).resolves.not.toThrow()
    })
  })

  describe("factory functions", () => {
    it("createFeatureFlagService should return service instance", () => {
      const service = createFeatureFlagService()
      expect(service).toBeInstanceOf(FeatureFlagService)
    })

    it("initializeFeatureFlags should initialize and return service", async () => {
      process.env.LAUNCHDARKLY_SDK_KEY = "test-sdk-key"

      const service = await initializeFeatureFlags()

      expect(service).toBeInstanceOf(FeatureFlagService)
      const LaunchDarklyClient = await import("@launchdarkly/node-server-sdk")
      expect(LaunchDarklyClient.default.init).toHaveBeenCalled()
    })
  })
})
