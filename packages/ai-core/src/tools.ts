import * as v from "valibot";
import { toJsonSchema } from "@valibot/to-json-schema";
import type {
  ToolDefinition,
  LLMToolDefinition,
  ResponsesFunctionToolDefinition,
} from "./types";

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

  toLLMFormat(): LLMToolDefinition[] {
    return this.list().map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: schemaToJsonSchema(tool.parameters),
      },
    }));
  }

  toResponsesFormat(): ResponsesFunctionToolDefinition[] {
    return this.list().map((tool) => ({
      type: "function" as const,
      name: tool.name,
      description: tool.description,
      parameters: schemaToJsonSchema(tool.parameters),
      strict: true,
    }));
  }
}

const enforceStrictSchema = (
  obj: Record<string, unknown>,
): Record<string, unknown> => {
  if (obj.type === "object") {
    obj.additionalProperties = false;
    const props = obj.properties as Record<string, unknown> | undefined;
    if (props) {
      const allKeys = Object.keys(props);
      const existing = (obj.required as string[]) ?? [];
      const missing = allKeys.filter((k) => !existing.includes(k));
      if (missing.length > 0) {
        obj.required = [...existing, ...missing];
      }
      for (const val of Object.values(props)) {
        if (val && typeof val === "object") {
          enforceStrictSchema(val as Record<string, unknown>);
        }
      }
    }
  }
  return obj;
};

const schemaToJsonSchema = (
  schema: v.GenericSchema,
): Record<string, unknown> => {
  const jsonSchema = toJsonSchema(schema) as Record<string, unknown>;
  delete jsonSchema["$schema"];
  return enforceStrictSchema(jsonSchema);
};

export const createToolRegistry = (): ToolRegistry => {
  return new ToolRegistry();
};
