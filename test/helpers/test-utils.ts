import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { HachikoConfig } from "../../src/config/schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load a test fixture file
 */
export function loadFixture(filepath: string): string {
  const fixturePath = join(__dirname, "../fixtures", filepath);
  return readFileSync(fixturePath, "utf-8");
}

/**
 * Load and parse a JSON fixture
 */
export function loadJsonFixture<T = any>(filepath: string): T {
  return JSON.parse(loadFixture(filepath));
}

/**
 * Create a test logger that captures log calls
 */
export function createTestLogger() {
  const logs: Array<{ level: string; message: string; data?: any }> = [];

  const logger = {
    info: (data: any, message?: string) => {
      logs.push({
        level: "info",
        message: message || data,
        data: typeof data === "object" ? data : undefined,
      });
    },
    warn: (data: any, message?: string) => {
      logs.push({
        level: "warn",
        message: message || data,
        data: typeof data === "object" ? data : undefined,
      });
    },
    error: (data: any, message?: string) => {
      logs.push({
        level: "error",
        message: message || data,
        data: typeof data === "object" ? data : undefined,
      });
    },
    debug: (data: any, message?: string) => {
      logs.push({
        level: "debug",
        message: message || data,
        data: typeof data === "object" ? data : undefined,
      });
    },
    child: () => logger,
    getLogs: () => logs,
    clearLogs: () => logs.splice(0, logs.length),
  };

  return logger;
}

/**
 * Test configuration for Hachiko
 */
export const testConfig: HachikoConfig = {
  plans: {
    directory: "migrations",
    extensions: [".md"],
  },
  agents: {
    claude: {
      type: "cli",
      command: "claude",
      args: ["--project", "{projectPath}"],
      container: {
        image: "anthropic/claude-cli:latest",
        timeout: 3600,
      },
    },
  },
  defaults: {
    agent: "claude",
    labels: ["hachiko", "migration"],
    strategy: {
      chunkBy: "directory",
      maxOpenPRs: 3,
    },
  },
  policies: {
    allowedPaths: ["src/**", "test/**", "migrations/**"],
    blockedPaths: [".git/**", "node_modules/**", "dist/**"],
    maxFileSize: 1048576,
    dangerousPatterns: ["rm -rf", "sudo", "eval"],
  },
  launchdarkly: {
    enabled: true,
    environment: "test",
    promptConfigs: {
      baseKey: "hachiko_prompts",
    },
  },
};

/**
 * Helper to wait for async operations in tests
 */
export const waitFor = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Mock console that captures output
 */
export function createMockConsole() {
  const outputs: Array<{ method: string; args: any[] }> = [];

  return {
    log: (...args: any[]) => outputs.push({ method: "log", args }),
    info: (...args: any[]) => outputs.push({ method: "info", args }),
    warn: (...args: any[]) => outputs.push({ method: "warn", args }),
    error: (...args: any[]) => outputs.push({ method: "error", args }),
    debug: (...args: any[]) => outputs.push({ method: "debug", args }),
    getOutputs: () => outputs,
    clearOutputs: () => outputs.splice(0, outputs.length),
  };
}
