import pino from "pino"

// Create a logger instance with structured JSON output
export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(process.env.NODE_ENV === "development" && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        ignore: "pid,hostname",
        translateTime: "SYS:standard",
      },
    },
  }),
})

// Create child loggers for different components
export const createLogger = (component: string) => logger.child({ component })

// Request ID tracking for webhook deliveries
export const withRequestId = (requestId: string) => logger.child({ requestId })

export type Logger = typeof logger
