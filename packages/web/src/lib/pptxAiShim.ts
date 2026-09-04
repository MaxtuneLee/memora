type UiPart = {
  type?: unknown;
  toolName?: unknown;
  toolCallId?: unknown;
  [key: string]: unknown;
};

const asUiPart = (part: unknown): UiPart | null =>
  typeof part === "object" && part !== null ? (part as UiPart) : null;

export const isTextUIPart = (part: unknown): boolean => {
  const value = asUiPart(part);
  return value?.type === "text" && typeof value.text === "string";
};

export const isToolUIPart = (part: unknown): boolean => {
  const type = asUiPart(part)?.type;
  return type === "tool" || (typeof type === "string" && type.startsWith("tool-"));
};

export const isDynamicToolUIPart = (part: unknown): boolean =>
  asUiPart(part)?.type === "dynamic-tool";

export const getToolOrDynamicToolName = (part: unknown): string => {
  const value = asUiPart(part);
  if (typeof value?.toolName === "string") return value.toolName;
  if (typeof value?.type === "string" && value.type.startsWith("tool-")) {
    return value.type.slice("tool-".length);
  }
  return "tool";
};
