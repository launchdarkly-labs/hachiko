import pino from "pino";
export declare const logger: pino.Logger<never, boolean>;
export declare const createLogger: (component: string) => pino.Logger<never, boolean>;
export declare const withRequestId: (requestId: string) => pino.Logger<never, boolean>;
export type Logger = typeof logger;
//# sourceMappingURL=logger.d.ts.map
