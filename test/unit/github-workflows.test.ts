import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import yaml from "js-yaml";

/**
 * Test suite to validate GitHub Actions workflow files for syntax errors
 * This prevents shell script syntax errors from being committed to the repository
 */
describe("GitHub Workflows Validation", () => {
  const workflowsDir = join(process.cwd(), ".github/workflows");

  // Get all YAML files in the workflows directory
  const workflowFiles = readdirSync(workflowsDir).filter(
    (file) => file.endsWith(".yml") || file.endsWith(".yaml")
  );

  describe("YAML Syntax Validation", () => {
    workflowFiles.forEach((filename) => {
      it(`should have valid YAML syntax: ${filename}`, () => {
        const filepath = join(workflowsDir, filename);
        const content = readFileSync(filepath, "utf8");

        expect(() => {
          yaml.load(content);
        }).not.toThrow();
      });
    });
  });

  describe("Shell Script Syntax Validation", () => {
    workflowFiles.forEach((filename) => {
      it(`should have valid shell script syntax in run blocks: ${filename}`, async () => {
        const filepath = join(workflowsDir, filename);
        const content = readFileSync(filepath, "utf8");

        // Parse YAML to extract shell scripts
        const workflow = yaml.load(content) as any;
        const shellScripts = extractShellScripts(workflow);

        // Validate each shell script
        const errors: string[] = [];

        for (const [location, script] of shellScripts) {
          try {
            await validateShellScript(script);
          } catch (error) {
            errors.push(`${location}: ${error}`);
          }
        }

        if (errors.length > 0) {
          throw new Error(`Shell script syntax errors in ${filename}:\n${errors.join("\n")}`);
        }
      });
    });
  });

  describe("Migration ID Extraction Logic", () => {
    it("should correctly extract migration ID from Hachiko branch names", () => {
      // Test cases for the migration ID extraction logic used in migration-dashboard.yml
      const testCases = [
        {
          branch: "hachiko/add-jsdoc-comments-step-1",
          expected: "add-jsdoc-comments",
          description: "multi-word migration with step number",
        },
        {
          branch: "hachiko/flatten-monorepo-step-2",
          expected: "flatten-monorepo",
          description: "hyphenated migration with step number",
        },
        {
          branch: "hachiko/test-simple-validation-step-1",
          expected: "test-simple-validation",
          description: "triple-word migration with step number",
        },
        {
          branch: "hachiko/optimize-imports-step-10",
          expected: "optimize-imports",
          description: "double-digit step number",
        },
      ];

      testCases.forEach(({ branch, expected, description }) => {
        // Simulate the exact extraction logic from migration-dashboard.yml:182
        const extractedId = branch
          .replace(/^hachiko\//, "") // Remove 'hachiko/' prefix
          .replace(/-step-[0-9]+$/, ""); // Remove '-step-{number}' suffix

        expect(extractedId).toBe(
          expected,
          `Failed for ${description}: ${branch} should extract '${expected}' but got '${extractedId}'`
        );
      });
    });

    it("should handle edge cases in migration ID extraction", () => {
      const edgeCases = [
        {
          branch: "hachiko/single-step-1",
          expected: "single",
          description: "single word migration",
        },
        {
          branch: "hachiko/has-step-in-name-step-1",
          expected: "has-step-in-name",
          description: "migration name containing 'step'",
        },
      ];

      edgeCases.forEach(({ branch, expected, description }) => {
        const extractedId = branch.replace(/^hachiko\//, "").replace(/-step-[0-9]+$/, "");

        expect(extractedId).toBe(
          expected,
          `Failed for edge case ${description}: ${branch} should extract '${expected}' but got '${extractedId}'`
        );
      });
    });
  });
});

/**
 * Recursively extract all shell scripts from a GitHub Actions workflow
 */
function extractShellScripts(obj: any, path: string = ""): Array<[string, string]> {
  const scripts: Array<[string, string]> = [];

  if (!obj || typeof obj !== "object") {
    return scripts;
  }

  // Check if this is a step with a run command
  if (obj.run && typeof obj.run === "string") {
    const stepName = obj.name || "unnamed step";
    scripts.push([`${path}.${stepName}`, obj.run]);
  }

  // Recursively search nested objects
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "object" && value !== null) {
      const nestedPath = path ? `${path}.${key}` : key;
      scripts.push(...extractShellScripts(value, nestedPath));
    }
  }

  return scripts;
}

/**
 * Validate shell script syntax using bash -n (syntax check only, no execution)
 */
async function validateShellScript(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const bash = spawn("bash", ["-n"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";

    bash.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    bash.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Syntax error: ${stderr.trim()}`));
      }
    });

    bash.on("error", (error) => {
      reject(new Error(`Failed to spawn bash: ${error.message}`));
    });

    // Write the script to bash stdin
    bash.stdin.write(script);
    bash.stdin.end();
  });
}
