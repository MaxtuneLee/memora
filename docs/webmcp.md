# WebMCP and external assistants

Memora exposes tools through `@mcp-b/global` 6.0.3. It uses MCP-B's `document.modelContext` API and types, including the native WebMCP bridge and browser fallback. Memora does not implement its own WebMCP interface or run an MCP relay server.

## Enable access

Open **Settings > Permissions > WebMCP** on the device running Memora.

| Control | Default | Effect |
| --- | --- | --- |
| Enable WebMCP | Off | Loads MCP-B and registers the allowed tools while Memora is open. |
| Allow reading | On, inactive until WebMCP is enabled | Allows searching and reading library files, transcripts, and chat history. |
| Allow changes | Off | Allows creating and editing documents and opening pages in the current tab. |

The three controls are device settings and do not sync to other devices. Reading and changing are independent: enabling changes does not enable the read tools. With both permissions off, no tools are registered. Turning WebMCP off or changing its permissions aborts the previous registrations and pending approval requests. Retained tool callbacks also check the live settings before execution; read results are withheld if access is revoked while the read is running. Work that has already started writing cannot be rolled back by the switch.

File access continues through `createChatTools` and the existing permission checks (ADR 0010). Saved grants apply, guarded reads still ask, and writes require approval or a saved grant. External requests ask the user in the current tab; they do not use chat Auto review. A cancelled invocation removes its pending dialog request. Chat history retains the existing chat tool policy and can be read when **Allow reading** is enabled.

## Connect a local relay

Install/configure `@mcp-b/webmcp-local-relay` in the **external MCP client**, not in Memora's web dependencies. For example:

```json
{
  "mcpServers": {
    "memora-webmcp": {
      "command": "npx",
      "args": ["-y", "@mcp-b/webmcp-local-relay@6.0.3", "--widget-origin", "http://localhost:9003"]
    }
  }
}
```

Replace the origin with the actual Memora origin, including the port. Keep Memora open and enable the desired permissions. The local relay also needs its official browser embed on the page to discover and call `document.modelContext` tools. The MCP-B runtime by itself does not open a connection to the localhost relay.

For a browser automation client or a local development session, load the official embed in the Memora tab after enabling WebMCP:

```js
const script = document.createElement("script");
script.src = "https://cdn.jsdelivr.net/npm/@mcp-b/webmcp-local-relay@6.0.3/dist/browser/embed.js";
script.crossOrigin = "anonymous";
document.head.appendChild(script);
```

The embed fetches its sibling `widget.html` and creates a hidden iframe with the page's origin. It reads the registered tools and connects to the loopback relay (port 9333 by default). The browser may ask for local network access. Reloading the page removes this manually loaded embed, so load it again if needed. Memora does not bundle or automatically inject the relay embed. Turning Memora's WebMCP switch off withdraws its tools even if an external embed is still present.

In the MCP client, call `webmcp_list_sources`, then `webmcp_list_tools`. Call a listed tool directly, or use `webmcp_call_tool`. When testing revocation, retain a tool name, disable its permission in Memora, and verify a new call fails. For changes, try creating a document and deny its permission request; no document should be created.

The tab transport accepts the current origin only. The local relay's blob iframe inherits that origin. Cross-origin browser clients need a separately reviewed integration.

## Tool access

| Permission | Tools |
| --- | --- |
| Reading | `describe_table`, `query_db`, `search_files`, `read_extracted_content`, `search_transcript`, `read_transcript`, `read_file`, `grep_files`, `list_chat_sessions`, `read_chat_session` |
| Changes | `create_document`, `modify_text_file`, `open_page` |

`open_page` changes the current tab and can open the live recording page, so it belongs to **Allow changes**. It accepts only app paths starting with a single `/`; external URLs, backslashes, and control characters are rejected. Other chat tools remain private. Add a tool to the explicit access map in `packages/web/src/lib/webmcp/tools.ts` only after deciding which permission it requires.

The React hook loads MCP-B only when enabled and at least one permission is allowed. It disables import-time initialization, initializes the official runtime with a same-origin transport, and passes an `AbortSignal` when registering each tool. Cleanup aborts those registrations and calls MCP-B's `cleanupWebModelContext`.

## Validation

Build the workspace dependencies first with `vp run -t @memora/web#build`. From `packages/web`, run the related checks:

```sh
vp test run test/settings/webMcpSettings.test.tsx test/chat/useWebMcpTools.test.tsx test/chat/webMcpTools.test.ts test/chat/tabAccessRequests.test.tsx test/chat/permissions.test.ts test/settings/settingsSync.test.ts
vp test run --config vite.browser.config.ts test/browser/webMcpRuntime.browser.test.tsx
vp exec tsc -p tsconfig.app.json --noEmit
```

The unit and integration tests cover default exposure, independent read/write permissions, device-only persistence, input validation, existing write grants, permission revocation, cancellation of queued approvals, settings controls, and React lifecycle cleanup. The Chromium test uses the installed MCP-B runtime to register, discover, execute, and withdraw a tool. A full external relay session requires the MCP client and browser embed described above and is not part of these automated tests.

References: [MCP-B global runtime](https://docs.mcp-b.ai/packages/global/reference), [local relay setup](https://docs.mcp-b.ai/how-to/connect-desktop-agents-with-local-relay), [relay reference and browser embed](https://github.com/WebMCP-org/npm-packages/tree/main/packages/webmcp-local-relay).
