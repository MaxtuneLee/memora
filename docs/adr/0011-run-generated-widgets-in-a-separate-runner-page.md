# Run generated widgets in a separate runner page, on another site when one is configured

## Context

ADR 0006 sandboxed Home Grid widgets with `sandbox="allow-scripts allow-forms"` on a `srcdoc`
iframe, and left Chat widgets unsandboxed because they only run while the user watches them
stream. Two problems remain:

- **A widget can freeze the app.** A `srcdoc` iframe is same-site with the app, so the browser
  runs it on the app's main thread. A widget script containing `while (true) {}` freezes the whole
  app, and nothing on that thread can notice or stop it. Only a frame in another process can be
  abandoned while the app keeps running.
- **Chat widgets have the app's own power.** Their iframe has no `sandbox`, is same-origin, and
  receives a live bridge object. Widget code can read OPFS and LiveStore data. The risk was
  accepted for streaming previews, but the code is still model output.

The "CDN allowlist (CSP-enforced)" line in the show-widget-skills docs was also not backed by
any Content-Security-Policy.

## Decision

Both Chat and Home Grid widgets run in one **runner page** (`widget-runner.html`), and the host
talks to it only through `postMessage`.

- **The runner is static and knows no widget.** The host posts the widget's style, markup and
  scripts (`render`, `run`), plus data, theme and pings. The runner renders and runs them. This is
  the same pattern as other code-playground and plugin sandboxes. The protocol is in
  `lib/widgets/sandbox/protocol.ts`; the runner is `src/widgetRunner/runner.ts`.
- **The runner can be served from another site.** `VITE_WIDGET_SANDBOX_URL` names the runner on a
  different registrable domain. Browsers that isolate sites give that frame its own process, so a
  widget that never returns blocks only itself. When the variable is unset, or the app is offline,
  the frame loads the runner the app serves itself (`/widget-runner.html`). It is still sandboxed
  but shares the app's process, so it keeps the old freeze risk.
- **The frame keeps an opaque origin.** `sandbox="allow-scripts allow-forms"` with no
  `allow-same-origin`, in both modes. Widgets share no storage with each other and, when the
  runner is served by the app, cannot reach it. Because the origin is opaque the host posts with
  `targetOrigin: "*"` and identifies the frame by `event.source`. Messages to the frame carry only
  data that widget is already entitled to.
- **A watchdog removes a frame that stops answering.** The host pings every 2 seconds. After
  three missed answers (about 8 seconds, counted only while the tab is visible) the frame is
  removed and the widget shows "This widget stopped responding" with a reload button. A frame that
  never boots is removed after 15 seconds.
- **The host limits what the frame can ask for.** Every message is parsed field by field. The host
  caps `sendPrompt` and `openLink` to a burst of 3 then one every 2 seconds, `writeData` to a
  burst of 10 then 5 a second, prompt length to 20,000 characters, and the frame's height to 4,000
  pixels. `openLink` passes only http and https URLs. A frame that exceeds 400 messages in a
  burst (then 200 a second) is removed.
- **The runner page enforces the allowlist.** Its Content-Security-Policy limits scripts, styles,
  images, fonts and network requests to inline code and the documented CDN hosts, and blocks forms,
  frames and `<base>`. A widget can no longer send data to an arbitrary server.
- **One runtime.** `Chart`, `sendPrompt`, `openLink`, `getData`, `onData`, `writeData`, `lesson`
  and `MEMORA_HOME_WIDGET` exist in both places. Chat's live bridge object is gone.

## Consequences

- **Safari still freezes the app.** It does not give cross-site iframes their own process in all
  cases, so the watchdog cannot fire there while the widget holds the shared thread. The
  fallback mode has the same limit.
- **The sandbox site must be deployed.** `vp run -t @memora/web#build` writes
  `dist/widget-runner.html`, a single self-contained file. Copy it to a different registrable
  domain (not a subdomain of the app's), then set `VITE_WIDGET_SANDBOX_URL` at build time to its
  full URL. A static host works; Cloudflare Pages needs no configuration. Send
  `Cross-Origin-Resource-Policy: cross-origin` and `Cross-Origin-Embedder-Policy: require-corp`
  if the app itself is served with `require-corp` (the dev and preview servers are).
- **The runner needs the network once.** The remote runner is not cached by the app's service
  worker, so offline the frame loads the local copy and loses process isolation. Whether the
  service worker serves that copy to a sandboxed frame has not been checked in a production build.
- **Widgets can no longer reach arbitrary hosts.** Anything outside inline code and the four CDN
  hosts, including Google Fonts other than the app's own stylesheet, is blocked.
- **Scripts run as one block.** Allowlisted external scripts load first, in order, then all inline
  scripts run together, as Home Grid did. Chat used to run each inline script separately.
- Cleanup functions a script returns still run before a rerun or on teardown.
