"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withRequestId = exports.createLogger = exports.logger = void 0;
const tslib_1 = require("tslib");
const pino_1 = tslib_1.__importDefault(require("pino"));
// Create a logger instance with structured JSON output
exports.logger = (0, pino_1.default)({
    level: process.env.LOG_LEVEL || "info",
    formatters: {
        level: (label) => ({ level: label }),
    },
    timestamp: pino_1.default.stdTimeFunctions.isoTime,
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
// Create child loggers for different components
const createLogger = (component) => exports.logger.child({ component });
exports.createLogger = createLogger;
// Request ID tracking for webhook deliveries
const withRequestId = (requestId) => exports.logger.child({ requestId });
exports.withRequestId = withRequestId;
//# sourceMappingURL=logger.js.map