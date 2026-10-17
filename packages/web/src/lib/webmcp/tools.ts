import { toPiTool } from "@memora/ai-core";
import type { WebMCP } from "@mcp-b/global";
import type { NavigateFunction } from "react-router";
import * as v from "valibot";

import { createChatTools, type StoreQueryable } from "@/lib/chat/tools";
import { requestTabAccess } from "@/lib/chat/tabAccessRequests";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { normalizeSettingsValue } from "@/livestore/setting";

// Explicitly classify tools; new chat tools are private until reviewed here.
const TOOL_ACCESS: Readonly<Record<string, "read" | "write">> = {
  describe_table: "read",
  query_db: "read",
  search_files: "read",
  read_extracted_content: "read",
  search_transcript: "read",
  read_transcript: "read",
  read_file: "read",
  grep_files: "read",
  list_chat_sessions: "read",
  read_chat_session: "read",
  create_document: "write",
  modify_text_file: "write",
  open_page: "write",
};

/** Register through MCP-B's standard API; its AbortSignal removes registrations on cleanup. */
export async function registerWebMcpTools(
  context: WebMCP.ModelContext,
  store: StoreQueryable,
  navigate: NavigateFunction,
  lifetime: AbortSignal,
): Promise<void> {
  const allowed = (access: "read" | "write") => {
    const settings = normalizeSettingsValue(store.query(settingsDocumentQuery$));
    return (
      !lifetime.aborted &&
      settings.webMcpEnabled === true &&
      (access === "read" ? settings.webMcpReadEnabled : settings.webMcpWriteEnabled) === true
    );
  };
  const registrations: Promise<void>[] = [];
  const register = (definition: WebMCP.ModelContextTool, access: "read" | "write") => {
    if (!allowed(access)) return;
    registrations.push(
      context.registerTool(
        {
          ...definition,
          annotations: { readOnlyHint: access === "read", untrustedContentHint: true },
          execute: async (input, options) => {
            if (!allowed(access)) throw new Error("WebMCP access has been disabled.");
            options.signal.throwIfAborted();
            const result = await definition.execute(input, options);
            // Do not release a read result after access was revoked.
            if (!allowed(access)) throw new Error("WebMCP access has been disabled.");
            options.signal.throwIfAborted();
            return result;
          },
        },
        { signal: lifetime },
      ),
    );
  };

  for (const tool of createChatTools(store)) {
    const access = TOOL_ACCESS[tool.name];
    if (!access) continue;
    register(
      {
        name: tool.name,
        description: tool.description,
        inputSchema: toPiTool(tool).parameters,
        execute: async (input, options) => {
          const signal = AbortSignal.any([lifetime, options.signal]);
          const assertAllowed = () => {
            signal.throwIfAborted();
            if (!allowed(access)) throw new Error("WebMCP access has been disabled.");
          };
          // Each invocation owns its approval cancellation signal, including concurrent calls.
          const guarded = createChatTools(store, {
            requestAccess: async (request) => ({
              decision: await requestTabAccess(request, signal),
              source: "user",
            }),
            // Recheck after an asynchronous permission dialog, before the tool body runs.
            onAccessDecided: assertAllowed,
          }).find((candidate) => candidate.name === tool.name);
          if (!guarded) throw new Error(`Unknown WebMCP tool: ${tool.name}`);
          assertAllowed();
          return guarded.execute(v.parse(guarded.parameters, input));
        },
      },
      access,
    );
  }

  register(
    {
      name: "open_page",
      description:
        "Open a Memora page in this tab. Paths: /desktop (library), /chat, /chat?session=<sessionId>, /editor/file/<fileId> (documents), /transcript/file/<fileId>?seek=<seconds> (audio and video), /transcript/live (start a recording).",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string", description: "App path starting with /" } },
        required: ["path"],
      },
      execute: async (input) => {
        const path = input.path;
        if (
          typeof path !== "string" ||
          !path.startsWith("/") ||
          path.startsWith("//") ||
          path.includes("\\") ||
          /\p{Cc}/u.test(path)
        ) {
          throw new Error("path must be an app path starting with a single /");
        }
        await navigate(path);
        return { opened: path };
      },
    },
    "write",
  );
  await Promise.all(registrations);
}
