import { vi } from "vitest";

// Mock environment variables
process.env.NODE_ENV = "test";
process.env.GITHUB_APP_ID = "12345";
process.env.GITHUB_PRIVATE_KEY = "test-private-key";
process.env.WEBHOOK_SECRET = "test-webhook-secret";
process.env.LAUNCHDARKLY_SDK_KEY = "test-ld-key";

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// Mock pino logger
vi.mock("pino", () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => mockLogger),
  };

  const mockPino = vi.fn(() => mockLogger);
  mockPino.stdTimeFunctions = {
    isoTime: vi.fn(() => '"2023-01-01T00:00:00.000Z"'),
  };

  return { default: mockPino };
});
