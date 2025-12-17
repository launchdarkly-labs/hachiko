import type { Context } from "probot";
import type { HachikoCommand } from "../utils/commands.js";
import type { Logger } from "../utils/logger.js";
/**
 * Handle /hachi rebase command
 */
export declare function handleRebaseCommand(
  context: Context<"issue_comment.created">,
  command: HachikoCommand,
  logger: Logger
): Promise<void>;
/**
 * Handle /hachi pause command
 */
export declare function handlePauseCommand(
  context: Context<"issue_comment.created">,
  command: HachikoCommand,
  logger: Logger
): Promise<void>;
/**
 * Handle /hachi resume command
 */
export declare function handleResumeCommand(
  context: Context<"issue_comment.created">,
  command: HachikoCommand,
  logger: Logger
): Promise<void>;
/**
 * Handle /hachi adopt command
 */
export declare function handleAdoptCommand(
  context: Context<"issue_comment.created">,
  command: HachikoCommand,
  logger: Logger
): Promise<void>;
/**
 * Handle /hachi status command
 */
export declare function handleStatusCommand(
  context: Context<"issue_comment.created">,
  command: HachikoCommand,
  logger: Logger
): Promise<void>;
/**
 * Handle /hachi skip command
 */
export declare function handleSkipCommand(
  context: Context<"issue_comment.created">,
  command: HachikoCommand,
  logger: Logger
): Promise<void>;
/**
 * Handle /hachi retry command
 */
export declare function handleRetryCommand(
  context: Context<"issue_comment.created">,
  command: HachikoCommand,
  logger: Logger
): Promise<void>;
//# sourceMappingURL=commands.d.ts.map
