import type LaunchDarklyClient from "@launchdarkly/node-server-sdk"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FeatureFlagService } from "../../../src/services/feature-flags.js"

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

describe("FeatureFlagService", () => {
  let service: FeatureFlagService
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = process.env
    process.env = { ...originalEnv }
    // Reset the singleton instance
    // @ts-ignore - accessing private property for testing
    FeatureFlagService.instance = null
    service = FeatureFlagService.getInstance()
  })

  afterEach(async () => {
    process.env = originalEnv
    await service.close()
    vi.clearAllMocks()
  })

  it("should be a singleton", () => {
    const instance1 = FeatureFlagService.getInstance()
    const instance2 = FeatureFlagService.getInstance()
    expect(instance1).toBe(instance2)
  })

  it("should initialize without SDK key in test mode", async () => {
    process.env.LAUNCHDARKLY_SDK_KEY = undefined
    await service.initialize()
    // Should not throw
  })

  it("should initialize with SDK key", async () => {
    process.env.LAUNCHDARKLY_SDK_KEY = "test-sdk-key"
    process.env.NODE_ENV = "test"

    await service.initialize()
    // Should not throw
  })

  it("should not initialize twice", async () => {
    process.env.LAUNCHDARKLY_SDK_KEY = "test-sdk-key"
    process.env.NODE_ENV = "test"

    await service.initialize()
    await service.initialize() // Second call should return early
    // Should not throw
  })

  it("should return default value when not initialized", async () => {
    const context: LaunchDarklyClient.LDContext = {
      kind: "user",
      key: "test-user",
    }

    const value = await service.getBooleanFlag("test-flag", context, false)
    expect(value).toBe(false)
  })

  it("should return default value when client is not available", async () => {
    process.env.LAUNCHDARKLY_SDK_KEY = undefined
    await service.initialize()

    const context: LaunchDarklyClient.LDContext = {
      kind: "user",
      key: "test-user",
    }

    const value = await service.getBooleanFlag("test-flag", context, false)
    expect(value).toBe(false)
  })

  it("should evaluate test-flag successfully", async () => {
    process.env.LAUNCHDARKLY_SDK_KEY = "test-sdk-key"
    process.env.NODE_ENV = "test"

    const LaunchDarkly = await import("@launchdarkly/node-server-sdk")
    const mockClient = LaunchDarkly.default.init("test-key")

    vi.mocked(mockClient.variation).mockResolvedValue(true)

    await service.initialize()

    const context: LaunchDarklyClient.LDContext = {
      kind: "user",
      key: "test-user",
    }

    const value = await service.getBooleanFlag("test-flag", context, false)
    expect(value).toBe(true)
  })

  it("should handle variation errors gracefully", async () => {
    process.env.LAUNCHDARKLY_SDK_KEY = "test-sdk-key"
    process.env.NODE_ENV = "test"

    const LaunchDarkly = await import("@launchdarkly/node-server-sdk")
    const mockClient = LaunchDarkly.default.init("test-key")

    vi.mocked(mockClient.variation).mockRejectedValue(new Error("Network error"))

    await service.initialize()

    const context: LaunchDarklyClient.LDContext = {
      kind: "user",
      key: "test-user",
    }

    const value = await service.getBooleanFlag("test-flag", context, false)
    expect(value).toBe(false)
  })

  it("should execute function when test-flag is enabled", async () => {
    process.env.LAUNCHDARKLY_SDK_KEY = "test-sdk-key"
    process.env.NODE_ENV = "test"

    const LaunchDarkly = await import("@launchdarkly/node-server-sdk")
    const mockClient = LaunchDarkly.default.init("test-key")

    vi.mocked(mockClient.variation).mockResolvedValue(true)

    await service.initialize()

    const context: LaunchDarklyClient.LDContext = {
      kind: "user",
      key: "test-user",
    }

    const mockFn = vi.fn()
    await service.executeIfTestFlagEnabled(context, mockFn)

    expect(mockFn).toHaveBeenCalledTimes(1)
  })

  it("should not execute function when test-flag is disabled", async () => {
    process.env.LAUNCHDARKLY_SDK_KEY = "test-sdk-key"
    process.env.NODE_ENV = "test"

    const LaunchDarkly = await import("@launchdarkly/node-server-sdk")
    const mockClient = LaunchDarkly.default.init("test-key")

    vi.mocked(mockClient.variation).mockResolvedValue(false)

    await service.initialize()

    const context: LaunchDarklyClient.LDContext = {
      kind: "user",
      key: "test-user",
    }

    const mockFn = vi.fn()
    await service.executeIfTestFlagEnabled(context, mockFn)

    expect(mockFn).not.toHaveBeenCalled()
  })

  it("should handle async functions in executeIfTestFlagEnabled", async () => {
    process.env.LAUNCHDARKLY_SDK_KEY = "test-sdk-key"
    process.env.NODE_ENV = "test"

    const LaunchDarkly = await import("@launchdarkly/node-server-sdk")
    const mockClient = LaunchDarkly.default.init("test-key")

    vi.mocked(mockClient.variation).mockResolvedValue(true)

    await service.initialize()

    const context: LaunchDarklyClient.LDContext = {
      kind: "user",
      key: "test-user",
    }

    const mockAsyncFn = vi.fn().mockResolvedValue(undefined)
    await service.executeIfTestFlagEnabled(context, mockAsyncFn)

    expect(mockAsyncFn).toHaveBeenCalledTimes(1)
  })

  it("should close the service properly", async () => {
    process.env.LAUNCHDARKLY_SDK_KEY = "test-sdk-key"
    process.env.NODE_ENV = "test"

    const LaunchDarkly = await import("@launchdarkly/node-server-sdk")
    const mockClient = LaunchDarkly.default.init("test-key")

    await service.initialize()
    await service.close()

    expect(mockClient.close).toHaveBeenCalled()
  })
})
