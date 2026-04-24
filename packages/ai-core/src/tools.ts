import * as v from "valibot";
import type { ToolDefinition } from "./types";

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register<TParams, TResult>(tool: ToolDefinition<TParams, TResult>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool as ToolDefinition);
  }

  unregister(name: string): void {
    if (!this.tools.has(name)) {
      throw new Error(`Tool "${name}" is not registered`);
    }
    this.tools.delete(name);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ result: unknown; isError: boolean }> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { result: `Tool "${name}" not found`, isError: true };
    }

    try {
      const parsed = v.parse(tool.parameters, args);
      const result = await tool.execute(parsed);
      return { result, isError: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { result: message, isError: true };
    }
  }
}

export const createToolRegistry = (): ToolRegistry => {
  return new ToolRegistry();
};
