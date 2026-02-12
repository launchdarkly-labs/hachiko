import pino from "pino";
/**
 * Root logger instance configured with structured JSON output.
 *
 * Uses pino for high-performance logging. In development mode, output is
 * pretty-printed with colors. The log level can be configured via the
 * `LOG_LEVEL` environment variable (defaults to "info").
 *
 * @example
 * ```typescript
 * logger.info({ migrationId: 'add-jsdoc' }, 'Migration started');
 * logger.error({ error }, 'Failed to execute step');
 * ```
 */
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
});
/**
 * Creates a child logger scoped to a specific component.
 *
 * Child loggers automatically include the component name in every log entry,
 * making it easier to filter and trace logs from specific parts of the system.
 *
 * @param component - The name of the component (e.g., "state-inference", "pr-detection")
 * @returns A child pino logger instance with the component field set
 * @example
 * ```typescript
 * const log = createLogger('state-inference');
 * log.info('Calculating migration state'); // Includes { component: 'state-inference' }
 * ```
 */
export const createLogger = (component) => logger.child({ component });
/**
 * Creates a child logger with a request ID for tracing webhook deliveries.
 *
 * @param requestId - The unique identifier for the webhook delivery or request
 * @returns A child pino logger instance with the requestId field set
 * @example
 * ```typescript
 * const log = withRequestId('abc-123');
 * log.info('Processing webhook'); // Includes { requestId: 'abc-123' }
 * ```
 */
export const withRequestId = (requestId) => logger.child({ requestId });
//# sourceMappingURL=logger.js.map