import { useEffect } from "react";
import { useNavigate } from "react-router";
import { toPiTool } from "@memora/ai-core";
import * as v from "valibot";

import { useAppStore } from "@/livestore/store";
import { createChatTools } from "@/lib/chat/tools";

// WebMCP (https://webmachinelearning.github.io/webmcp/) is not in lib.dom yet.
interface ModelContextTool {
  name: string;
  description: string;
  inputSchema?: object;
  execute: (input: Record<string, unknown>) => Promise<unknown>;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
}

interface ModelContext {
  // The spec returns a promise; Chrome's early builds return undefined.
  registerTool: (
    tool: ModelContextTool,
    options?: { signal?: AbortSignal },
  ) => Promise<void> | undefined;
}

// Read-only chat tools; the write tools need the in-app approval dialog, so they stay in chat.
const EXPOSED_TOOLS = new Set([
  "describe_table",
  "query_db",
  "search_files",
  "read_extracted_content",
  "search_transcript",
  "read_transcript",
  "read_file",
  "grep_files",
  "list_chat_sessions",
  "read_chat_session",
]);

/** Exposes Memora's library tools to the browser's agent through WebMCP, when the browser has it. */
export function useWebMcpTools(): void {
  const store = useAppStore();
  const navigate = useNavigate();
  useEffect(() => {
    // Chrome 150+ moved the API to document.modelContext; Chrome 149 had it on navigator.
    const modelContext =
      (document as Document & { modelContext?: ModelContext }).modelContext ??
      (navigator as Navigator & { modelContext?: ModelContext }).modelContext;
    if (!modelContext) {
      console.info("[WebMCP] document.modelContext is not available; no tools registered.");
      return;
    }
    const controller = new AbortController();
    const register = (tool: ModelContextTool): void => {
      // Promise.try also catches a synchronous throw from registerTool.
      Promise.try(() => modelContext.registerTool(tool, { signal: controller.signal }))
        .then(() => console.info(`[WebMCP] registered ${tool.name}`))
        .catch((error: unknown) =>
          console.error(`[WebMCP] failed to register ${tool.name}`, error),
        );
    };

    for (const tool of createChatTools(store)) {
      if (!EXPOSED_TOOLS.has(tool.name)) continue;
      register({
        name: tool.name,
        description: tool.description,
        inputSchema: toPiTool(tool).parameters,
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async (input) => tool.execute(v.parse(tool.parameters, input)),
      });
    }

    register({
      name: "open_page",
      description:
        "Open a Memora page in this tab. Paths: /desktop (library), /chat, /chat?session=<sessionId>, /editor/file/<fileId> (documents), /transcript/file/<fileId>?seek=<seconds> (audio and video at a moment), /transcript/live (start a recording).",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string", description: "App path starting with /" } },
        required: ["path"],
      },
      execute: async (input) => {
        const path = input.path;
        // Same-origin app paths only; "//host" would leave the site.
        if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
          return { error: "path must be an app path starting with a single /" };
        }
        await navigate(path);
        return { opened: path };
      },
    });

    return () => {
      console.info("[WebMCP] unregistering tools");
      controller.abort();
    };
  }, [store, navigate]);
}
