import { toJsonSchema } from "@valibot/to-json-schema";

import type { ProviderRequest, ToolDefinition } from "@memora/ai-core";
import type {
  LocalChatRequest,
  LocalReasoningMode,
  LocalToolDefinition,
} from "@memora/local-model-runtime";

const schemaToJsonSchema = (schema: ToolDefinition["parameters"]): Record<string, unknown> => {
  const jsonSchema = toJsonSchema(schema) as Record<string, unknown>;
  delete jsonSchema["$schema"];
  return normalizeJsonSchemaForLocalTools(jsonSchema);
};

const normalizeJsonSchemaForLocalTools = (
  schema: Record<string, unknown>,
): Record<string, unknown> => {
  const normalized = normalizeJsonSchemaValue(schema);
  return normalized && typeof normalized === "object" && !Array.isArray(normalized)
    ? (normalized as Record<string, unknown>)
    : schema;
};

const normalizeJsonSchemaValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(normalizeJsonSchemaValue);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, childValue] of Object.entries(value)) {
    normalized[key] = normalizeJsonSchemaValue(childValue);
  }

  if (normalized.type === undefined) {
    const inferredType = inferJsonSchemaType(normalized);
    if (inferredType) {
      normalized.type = inferredType;
    }
  }

  return normalized;
};

const inferJsonSchemaType = (schema: Record<string, unknown>): string | null => {
  if (
    schema.properties &&
    typeof schema.properties === "object" &&
    !Array.isArray(schema.properties)
  ) {
    return "object";
  }

  if (schema.items) {
    return "array";
  }

  if (Array.isArray(schema.enum)) {
    return inferEnumType(schema.enum);
  }

  if (schema.const !== undefined) {
    return inferPrimitiveType(schema.const);
  }

  return null;
};

const inferEnumType = (values: unknown[]): string | null => {
  const definedValues = values.filter((value) => value !== null);
  if (definedValues.length === 0) return null;

  const types = new Set(definedValues.map(inferPrimitiveType));
  if (types.size !== 1) return null;
  return types.values().next().value ?? null;
};

const inferPrimitiveType = (value: unknown): string | null => {
  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      return Number.isInteger(value) ? "integer" : "number";
    case "boolean":
      return "boolean";
    default:
      return null;
  }
};

const toLocalTools = (tools: ToolDefinition[]): LocalToolDefinition[] => {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: schemaToJsonSchema(tool.parameters),
  }));
};

export const providerRequestToLocalChatRequest = (
  request: ProviderRequest,
  options: { reasoningMode?: LocalReasoningMode } = {},
): LocalChatRequest => {
  return {
    modelId: request.model,
    systemPrompt: request.systemPrompt,
    messages: request.messages.map((message) => ({
      role: message.role,
      content: message.content,
      ...(message.reasoning ? { reasoning: message.reasoning } : {}),
    })),
    tools: toLocalTools(request.tools),
    ...(options.reasoningMode ? { reasoningMode: options.reasoningMode } : {}),
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    ...(request.maxTokens !== undefined ? { maxTokens: request.maxTokens } : {}),
  };
};
