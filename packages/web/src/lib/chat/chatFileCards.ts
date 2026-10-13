/** A library file the reply created or changed; shown as a card below it. */
export interface ChatFileCard {
  fileId: string;
  name: string;
  action: "created" | "modified";
}

const WRITE_TOOL_ACTIONS: Record<string, ChatFileCard["action"]> = {
  create_document: "created",
  modify_text_file: "modified",
};

/** The file card for a write tool's result, or null for other tools, failures, and non-library files. */
export const fileCardFromToolResult = (toolName: string, result: unknown): ChatFileCard | null => {
  const action = WRITE_TOOL_ACTIONS[toolName];
  if (!action || !result || typeof result !== "object") return null;
  const value = result as { id?: unknown; fileId?: unknown; name?: unknown };
  const fileId = value.fileId ?? value.id;
  if (typeof fileId !== "string" || !fileId || typeof value.name !== "string") return null;
  return { fileId, name: value.name, action };
};
