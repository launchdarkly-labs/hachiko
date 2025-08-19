import { describe, expect, it } from "vitest"
import { createLogger, withRequestId } from "../../../src/utils/logger.js"

describe("Logger utilities", () => {
  describe("createLogger", () => {
    it("should create a logger with component name", () => {
      const logger = createLogger("test-component")
      expect(logger).toBeDefined()
      expect(typeof logger.info).toBe("function")
      expect(typeof logger.error).toBe("function")
      expect(typeof logger.warn).toBe("function")
      expect(typeof logger.debug).toBe("function")
    })
  })

  describe("withRequestId", () => {
    it("should create a logger with request ID", () => {
      const requestId = "test-request-123"
      const logger = withRequestId(requestId)
      expect(logger).toBeDefined()
      expect(typeof logger.info).toBe("function")
    })
  })
})
