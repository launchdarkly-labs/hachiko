import pino from "pino";
/**
 * Root logger instance configured with structured JSON output.
 *
 * Uses pino for high-performance structured logging. In development mode,
 * output is formatted with pino-pretty for human readability. The log level
 * can be configured via the LOG_LEVEL environment variable.
 *
 * @example
 * ```typescript
 * logger.info({ migrationId: 'add-jsdoc' }, 'Migration started');
 * logger.error({ error }, 'Failed to execute step');
 * ```
 */
export declare const logger: pino.Logger<never, boolean>;
/**
 * Creates a child logger scoped to a specific component.
 *
 * Child loggers automatically include the component name in all log entries,
 * making it easy to filter and trace logs by subsystem.
 *
 * @param component - The name of the component (e.g., "state-inference", "pr-detection")
 * @returns A child pino logger instance with the component field set
 *
 * @example
 * ```typescript
 * const log = createLogger('state-inference');
 * log.info('Calculating migration state'); // Includes { component: 'state-inference' }
 * ```
 */
export declare const createLogger: (component: string) => pino.Logger<never, boolean>;
/**
 * Creates a child logger with a request ID for tracing webhook deliveries.
 *
 * Attaches a unique request identifier to all subsequent log entries,
 * enabling end-to-end tracing of a single webhook event through the system.
 *
 * @param requestId - The unique identifier for the webhook delivery
 * @returns A child pino logger instance with the requestId field set
 *
 * @example
 * ```typescript
 * const log = withRequestId('abc-123');
 * log.info('Processing webhook'); // Includes { requestId: 'abc-123' }
 * ```
 */
export declare const withRequestId: (requestId: string) => pino.Logger<never, boolean>;
/**
 * Type alias for the pino logger instance used throughout Hachiko.
 */
export type Logger = typeof logger;
//# sourceMappingURL=logger.d.ts.map