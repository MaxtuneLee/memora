## Widget data persistence

Write with `writeData(name, content)`. There is no `readData` — reading uses the same
`data_source` bridge every other catalog entry uses: `getData()` for a synchronous snapshot,
`onData(callback)` for the first value and every value after it. Bind `data_source: "widgetData"`
to read back what `writeData` wrote.

**`onData` delivers values in arrival order, not call order.** `getData()` can return empty
before the saved content has loaded, and the `onData` call carrying that content can arrive
afterward — a write and its own readback do not land together. Rendering once from the first
response and stopping (a one-shot "loaded" flag, a short timeout that treats an early empty read
as final) shows an empty widget forever even though the real data is still on its way.

- Keep the `onData` subscription live for the widget's whole lifetime — it is the ongoing data
  source, not a one-time initializer.
- Let a later, non-empty `onData` payload replace an earlier empty one. Never gate on "first
  response wins."
- Use `getData()` only for an on-demand snapshot (e.g. immediately before a `writeData` call) —
  never as the sole signal that loading has finished.
- `getData()` can return its value synchronously or as a Promise. Handle both.
- A loading timeout may change what is _displayed_ (a spinner, a placeholder) but must never
  write empty data into the widget's own state, and must never block a later `onData` call from
  applying.
- Each `onData` invocation must fully re-render from the payload it received — idempotent, not
  accumulating across calls — since the same callback fires again on every later update.
- Debugging a widget that isn't showing saved data: log which call produced the value (`getData`
  vs `onData`), the payload's top-level keys, the raw content's type before parsing, the parsed
  result, and any parse error.

**Persist through `writeData`/`widgetData`, never `localStorage`, `sessionStorage`, `indexedDB`,
or cookies.** Browser storage is scoped to the iframe's own partition: it does not show up on the
Desktop or in search, chat cannot read it back, and the sandboxed Home Grid runtime may not even
expose it. `writeData` is the only persistence surface a widget should use.
