import { useEffect } from "react";
import { useNavigate } from "react-router";

import { useAppStore } from "@/livestore/store";
import { normalizeSettingsValue } from "@/livestore/setting";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { registerWebMcpTools } from "@/lib/webmcp/tools";
import { startWebMcpRelay } from "@/lib/webmcp/relay";

/** Installs MCP-B only while this device allows external tool access. */
export function useWebMcpTools(): void {
  const store = useAppStore();
  const navigate = useNavigate();
  const settings = normalizeSettingsValue(store.useQuery(settingsDocumentQuery$));
  const enabled = settings.webMcpEnabled === true;
  const read = settings.webMcpReadEnabled === true;
  const write = settings.webMcpWriteEnabled === true;

  useEffect(() => {
    if (!enabled || (!read && !write)) return;

    const controller = new AbortController();
    let cleanupRuntime: (() => void) | undefined;
    let cleanupRelay: (() => void) | undefined;
    const start = async () => {
      // The package auto-initializes on import unless explicitly disabled first.
      window.__webModelContextOptions = { autoInitialize: false };
      const runtime = await import("@mcp-b/global");
      if (controller.signal.aborted) return;
      runtime.initializeWebModelContext({
        transport: { tabServer: { allowedOrigins: [window.location.origin] }, iframeServer: false },
      });
      cleanupRuntime = runtime.cleanupWebModelContext;
      const context = document.modelContext;
      if (!context) throw new Error("WebMCP is unavailable in this browser context.");
      await registerWebMcpTools(context, store, navigate, controller.signal);
      if (!controller.signal.aborted) cleanupRelay = startWebMcpRelay();
    };
    void start().catch((error: unknown) => {
      if (controller.signal.aborted) return;
      controller.abort();
      cleanupRelay?.();
      cleanupRuntime?.();
      console.error("[WebMCP] Could not expose tools", error);
    });

    return () => {
      controller.abort();
      cleanupRelay?.();
      cleanupRuntime?.();
    };
  }, [enabled, read, write, store, navigate]);
}
