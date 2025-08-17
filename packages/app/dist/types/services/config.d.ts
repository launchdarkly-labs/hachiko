import { type HachikoConfig } from "../config/schema.js";
import type { ContextWithRepository } from "../types/context.js";
/**
 * Load and validate Hachiko configuration from repository
 */
export declare function loadHachikoConfig(context: ContextWithRepository): Promise<HachikoConfig>;
/**
 * Validate a configuration object without loading from repository
 */
export declare function validateConfig(rawConfig: unknown): HachikoConfig;
//# sourceMappingURL=config.d.ts.map