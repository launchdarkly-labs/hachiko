import type { Context } from "probot";
import type { Logger } from "../utils/logger.js";
export declare function handlePullRequest(context: Context<"pull_request.closed" | "pull_request.opened" | "pull_request.synchronize">, logger: Logger): Promise<void>;
//# sourceMappingURL=pull_request.d.ts.map