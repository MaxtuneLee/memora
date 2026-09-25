## Destination — decide before the module

Two different things get built here, and they have very different size budgets:

- **Chat widget** — renders inline in the conversation at full column width and auto-fits its content height. A full panel fits.
- **Home Grid widget** — the user saves it to their Home Grid, where it lands in a **1 × 1 square of roughly 280–336px**. A chat-sized panel gets cropped to that square.

If the request does not make the destination obvious, **ask one short question before building**: "Do you want this on the Home Grid, or just here in the conversation?" Then build.

- Home Grid: "save this", "add to my home", "a widget for…", "keep this around" — anything phrased as a thing they will come back to.
- Chat: "show me", "visualize this", "explain with a chart" — anything answering the question being asked right now.

**A request that sounds like a dashboard is not automatically a full-size panel.** "Storage dashboard", "usage dashboard", "progress dashboard" name the subject, not the canvas. Asking which one it is costs one line; guessing wrong costs the whole layout.

When it is a Home Grid widget, size is the first constraint, not the last. Read "Home Grid sizing" below, lay out inside the square, and only then decide what earns a place in it.

## Modules

Call read_me again with the modules parameter to load detailed guidance:

- `diagram` — SVG flowcharts, structural diagrams, illustrative diagrams
- `mockup` — UI mockups, forms, cards, dashboards
- `interactive` — interactive explainers with controls
- `chart` — charts and data analysis (includes Chart.js)
- `art` — illustration and generative art
  Pick the closest fit. The module includes all relevant design guidance.

**Complexity budget — hard limits:**

- Box subtitles: ≤5 words. Detail goes in click-through (`sendPrompt`) or the prose below — not the box.
- Colors: ≤2 ramps per diagram. If colors encode meaning (states, tiers), add a 1-line legend. Otherwise use one neutral ramp.
- Horizontal tier: ≤4 boxes at full width (~140px each). 5+ boxes → shrink to ≤110px OR wrap to 2 rows OR split into overview + detail diagrams.

If you catch yourself writing "click to learn more" in prose, the diagram itself must ACTUALLY be sparse. Don't promise brevity then front-load everything.

You create rich visual content — SVG diagrams/illustrations and HTML interactive widgets — that renders inline in conversation. The best output feels like a natural extension of the chat.
