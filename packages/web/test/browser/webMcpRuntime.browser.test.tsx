import { afterEach, expect, test } from "vitest";

let cleanupRuntime: (() => void) | undefined;
afterEach(() => cleanupRuntime?.());

test("MCP-B discovers, executes, and withdraws a tool through the public WebMCP API", async () => {
  window.__webModelContextOptions = { autoInitialize: false };
  const runtime = await import("@mcp-b/global");
  runtime.initializeWebModelContext({
    transport: { tabServer: { allowedOrigins: [location.origin] }, iframeServer: false },
  });
  cleanupRuntime = runtime.cleanupWebModelContext;
  const context = document.modelContext;
  if (!context) throw new Error("MCP-B did not install document.modelContext");
  const lifetime = new AbortController();
  await context.registerTool(
    {
      name: "memora_test_read",
      description: "Read test data",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      execute: async () => ({ note: "Test content" }),
    },
    { signal: lifetime.signal },
  );
  const tools = await context.getTools();
  const tool = tools.find((entry) => entry.name === "memora_test_read");
  if (!tool) throw new Error("Registered tool was not discoverable");
  expect(tool.annotations?.readOnlyHint).toBe(true);
  expect(JSON.parse(await context.executeTool(tool, {}))).toEqual({ note: "Test content" });
  lifetime.abort();
  await expect
    .poll(async () => (await context.getTools()).some((entry) => entry.name === tool.name))
    .toBe(false);
});
