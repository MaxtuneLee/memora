# Sandbox generated Home Grid widgets; keep Chat's widget bridge unsandboxed

Chat's `show_widget` iframe has no `sandbox` attribute — it's same-origin, isolated only for DOM/CSS/global scope, and the host hands widget scripts a live JS object (`WIDGET_BRIDGE_KEY`) with full same-origin power. That's an acceptable risk for a widget that exists only while the user is actively watching it stream in a chat message.

Home Grid widget Instances are different: once saved, a `generated` Widget Definition auto-executes on every future Dashboard load, unattended, indefinitely. Reusing the same unsandboxed bridge would turn a one-off generation risk (e.g. prompt injection producing malicious script) into a persistent, silent code-execution surface.

Decision: generated Widget Instances render in an iframe with `sandbox="allow-scripts"` (no `allow-same-origin`), and receive their Catalog Entry data exclusively via `postMessage` — never through direct object/window access. This means Home Grid widgets need their own small runtime shim and message protocol, separate from Chat's `WIDGET_BRIDGE_KEY` pattern; the two are not unified even though they look similar. `builtin`-kind Instances (calendar, todo, recent) are unaffected — they're trusted first-party React with direct data access, no sandbox either way.
