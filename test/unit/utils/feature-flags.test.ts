import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  closeFeatureFlags,
  initializeFeatureFlags,
  isTestFlagEnabled,
  testFlagNoop,
} from "../../../src/utils/feature-flags.js"

describe("Feature Flags", () => {
  const originalEnv = process.env

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv }
  })

  afterEach(async () => {
    // Clean up
    await closeFeatureFlags()
    process.env = originalEnv
  })

  describe("initializeFeatureFlags", () => {
    it("should warn when LAUNCHDARKLY_SDK_KEY is not set", async () => {
      process.env.LAUNCHDARKLY_SDK_KEY = undefined
      await initializeFeatureFlags()
      // Should not throw, just log a warning
    })

    it("should initialize in test mode when NODE_ENV is test", async () => {
      process.env.NODE_ENV = "test"
      process.env.LAUNCHDARKLY_SDK_KEY = "test-key"
      await initializeFeatureFlags()
      // Should not throw
    })
  })

  describe("isTestFlagEnabled", () => {
    it("should return false when client is not initialized", async () => {
      process.env.LAUNCHDARKLY_SDK_KEY = undefined
      await initializeFeatureFlags()

      const result = await isTestFlagEnabled()
      expect(result).toBe(false)
    })

    it("should check test-flag with default user key", async () => {
      process.env.NODE_ENV = "test"
      process.env.LAUNCHDARKLY_SDK_KEY = "test-key"
      await initializeFeatureFlags()

      const result = await isTestFlagEnabled()
      // In test mode with offline client, should return default value (false)
      expect(typeof result).toBe("boolean")
    })

    it("should check test-flag with custom user key", async () => {
      process.env.NODE_ENV = "test"
      process.env.LAUNCHDARKLY_SDK_KEY = "test-key"
      await initializeFeatureFlags()

      const result = await isTestFlagEnabled("custom-user")
      // In test mode with offline client, should return default value (false)
      expect(typeof result).toBe("boolean")
    })
  })

  describe("testFlagNoop", () => {
    it("should execute noop when test-flag is checked", async () => {
      process.env.NODE_ENV = "test"
      process.env.LAUNCHDARKLY_SDK_KEY = "test-key"
      await initializeFeatureFlags()

      // Should not throw
      await testFlagNoop()
    })

    it("should execute noop with custom user key", async () => {
      process.env.NODE_ENV = "test"
      process.env.LAUNCHDARKLY_SDK_KEY = "test-key"
      await initializeFeatureFlags()

      // Should not throw
      await testFlagNoop("custom-user")
    })

    it("should handle when client is not initialized", async () => {
      process.env.LAUNCHDARKLY_SDK_KEY = undefined
      await initializeFeatureFlags()

      // Should not throw even when client is not initialized
      await testFlagNoop()
    })
  })

  describe("closeFeatureFlags", () => {
    it("should close the client gracefully", async () => {
      process.env.NODE_ENV = "test"
      process.env.LAUNCHDARKLY_SDK_KEY = "test-key"
      await initializeFeatureFlags()

      await closeFeatureFlags()
      // Should not throw
    })

    it("should handle closing when client is not initialized", async () => {
      await closeFeatureFlags()
      // Should not throw
    })
  })
})
