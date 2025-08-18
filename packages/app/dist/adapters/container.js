"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContainerExecutor = void 0;
exports.createContainerExecutor = createContainerExecutor;
const node_child_process_1 = require("node:child_process");
const errors_js_1 = require("../utils/errors.js");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)("container");
/**
 * Container execution utilities for agent sandboxing
 */
class ContainerExecutor {
    static instance = null;
    static getInstance() {
        if (!ContainerExecutor.instance) {
            ContainerExecutor.instance = new ContainerExecutor();
        }
        return ContainerExecutor.instance;
    }
    /**
     * Check if Docker is available
     */
    async isDockerAvailable() {
        try {
            const result = await this.executeCommand("docker", ["--version"]);
            return result.exitCode === 0;
        }
        catch {
            return false;
        }
    }
    /**
     * Create and start a container
     */
    async createContainer(config, workspacePath, repoPath) {
        const containerId = `hachiko-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const dockerArgs = [
            "run",
            "--detach",
            "--name",
            containerId,
            "--rm", // Auto-remove when stopped
            // Security constraints
            "--user",
            "1000:1000", // Run as non-root user
            "--read-only", // Read-only filesystem
            "--tmpfs",
            "/tmp:exec,size=100m", // Writable tmp with size limit
            "--cap-drop",
            "ALL", // Drop all Linux capabilities
            "--security-opt",
            "no-new-privileges", // Prevent privilege escalation
            // Resource limits
            ...(config.memoryLimit ? ["--memory", `${config.memoryLimit}m`] : []),
            ...(config.cpuLimit ? ["--cpus", config.cpuLimit.toString()] : []),
            // Network isolation
            "--network",
            "none", // No network access
            // Mounts
            "--mount",
            `type=bind,source=${workspacePath},target=/workspace`,
            "--mount",
            `type=bind,source=${repoPath},target=/repo,readonly`,
            // Working directory
            "--workdir",
            config.workdir || "/workspace",
            // Environment variables
            ...Object.entries(config.env || {}).flatMap(([key, value]) => ["-e", `${key}=${value}`]),
            // Image
            config.image,
            // Keep container running
            "sleep",
            "infinity",
        ];
        try {
            const result = await this.executeCommand("docker", dockerArgs);
            if (result.exitCode !== 0) {
                throw new Error(`Docker run failed: ${result.stderr}`);
            }
            logger.info({ containerId, image: config.image }, "Container created");
            return {
                containerId,
                image: config.image,
                workdir: config.workdir || "/workspace",
                mounts: [
                    { hostPath: workspacePath, containerPath: "/workspace", readonly: false },
                    { hostPath: repoPath, containerPath: "/repo", readonly: true },
                ],
                env: config.env || {},
            };
        }
        catch (error) {
            logger.error({ error, config }, "Failed to create container");
            throw new errors_js_1.AgentExecutionError(`Failed to create container: ${error instanceof Error ? error.message : String(error)}`, "container");
        }
    }
    /**
     * Execute a command inside a container
     */
    async executeInContainer(context, command, timeout = 300000 // 5 minutes default
    ) {
        const startTime = Date.now();
        const dockerArgs = [
            "exec",
            "--workdir",
            context.workdir,
            ...Object.entries(context.env).flatMap(([key, value]) => ["-e", `${key}=${value}`]),
            context.containerId,
            ...command,
        ];
        try {
            const result = await this.executeCommand("docker", dockerArgs, timeout);
            const executionTime = Date.now() - startTime;
            logger.debug({
                containerId: context.containerId,
                command,
                exitCode: result.exitCode,
                executionTime,
            }, "Command executed in container");
            return {
                exitCode: result.exitCode,
                stdout: result.stdout,
                stderr: result.stderr,
                executionTime,
            };
        }
        catch (error) {
            const executionTime = Date.now() - startTime;
            logger.error({
                error,
                containerId: context.containerId,
                command,
                executionTime,
            }, "Container command execution failed");
            throw new errors_js_1.AgentExecutionError(`Container execution failed: ${error instanceof Error ? error.message : String(error)}`, "container");
        }
    }
    /**
     * Stop and remove a container
     */
    async destroyContainer(containerId) {
        try {
            // Stop the container (this will also remove it due to --rm flag)
            await this.executeCommand("docker", ["stop", containerId]);
            logger.info({ containerId }, "Container destroyed");
        }
        catch (error) {
            logger.warn({ error, containerId }, "Failed to destroy container");
        }
    }
    /**
     * Execute a command with timeout
     */
    executeCommand(command, args, timeout = 30000) {
        return new Promise((resolve, reject) => {
            const process = (0, node_child_process_1.spawn)(command, args, {
                stdio: ["pipe", "pipe", "pipe"],
            });
            let stdout = "";
            let stderr = "";
            let timedOut = false;
            const timer = setTimeout(() => {
                timedOut = true;
                process.kill("SIGKILL");
                reject(new Error(`Command timed out after ${timeout}ms`));
            }, timeout);
            process.stdout.on("data", (data) => {
                stdout += data.toString();
            });
            process.stderr.on("data", (data) => {
                stderr += data.toString();
            });
            process.on("close", (code) => {
                clearTimeout(timer);
                if (!timedOut) {
                    resolve({
                        exitCode: code || 0,
                        stdout: stdout.trim(),
                        stderr: stderr.trim(),
                    });
                }
            });
            process.on("error", (error) => {
                clearTimeout(timer);
                if (!timedOut) {
                    reject(error);
                }
            });
        });
    }
}
exports.ContainerExecutor = ContainerExecutor;
/**
 * Factory function to create container executor
 */
function createContainerExecutor() {
    return ContainerExecutor.getInstance();
}
//# sourceMappingURL=container.js.map