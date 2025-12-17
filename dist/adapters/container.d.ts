import type { ContainerConfig, ContainerContext } from "./types.js";
/**
 * Container execution utilities for agent sandboxing
 */
export declare class ContainerExecutor {
  private static instance;
  static getInstance(): ContainerExecutor;
  /**
   * Check if Docker is available
   */
  isDockerAvailable(): Promise<boolean>;
  /**
   * Create and start a container
   */
  createContainer(
    config: ContainerConfig,
    workspacePath: string,
    repoPath: string
  ): Promise<ContainerContext>;
  /**
   * Execute a command inside a container
   */
  executeInContainer(
    context: ContainerContext,
    command: string[],
    timeout?: number
  ): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
    executionTime: number;
  }>;
  /**
   * Stop and remove a container
   */
  destroyContainer(containerId: string): Promise<void>;
  /**
   * Execute a command with timeout
   */
  executeCommand(
    command: string,
    args: string[],
    timeout?: number
  ): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
}
/**
 * Factory function to create container executor
 */
export declare function createContainerExecutor(): ContainerExecutor;
//# sourceMappingURL=container.d.ts.map
