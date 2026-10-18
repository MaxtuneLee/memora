# streamdown-pele

A [Streamdown](https://streamdown.ai) plugin that renders `mermaid` code blocks with [Pele](https://pele.run).

This package is a thin adapter. All parsing, layout, and SVG output come from [Pele](https://github.com/obsidianmd/pele) by [kepano](https://github.com/kepano), which is MIT licensed. Pele implements Mermaid 12.1.0 syntax with its own layout and visual style. This project is not affiliated with Pele, Mermaid, or Streamdown.

## Why use it

Streamdown's default `@streamdown/mermaid` plugin runs Mermaid.js. Pele is much smaller and renders synchronously. In our measurements in Chromium (gzip, diagrams loaded on demand):

|                                                   | `@streamdown/mermaid` | `streamdown-pele` |
| ------------------------------------------------- | --------------------- | ----------------- |
| First load                                        | about 160 kB          | about 10 kB       |
| Flowchart, sequence, class, state, and pie loaded | about 419 kB          | about 91 kB       |
| Every diagram type loaded                         | about 863 kB          | about 270 kB      |
| Flowchart render, repeated                        | about 37 ms           | about 1.2 ms      |

Numbers vary by machine and bundler, so measure in your own app. Pele's text measurement is an estimate rather than a DOM measurement, so complex labels can wrap differently from Mermaid.js.

## Install

```sh
npm install streamdown-pele streamdown
```

## Usage

```tsx
import { Streamdown } from "streamdown";
import { pele } from "streamdown-pele";

export function Message({ children }: { children: string }) {
  return <Streamdown plugins={{ mermaid: pele }}>{children}</Streamdown>;
}
```

To pass Pele render options, create the plugin yourself:

```ts
import { createPelePlugin } from "streamdown-pele";

const mermaid = createPelePlugin({
  options: { fontSize: 14, responsive: true },
});
```

See Pele's [API reference](https://pele.run/api) for the available options.

## Theming

Pele reads its colors and fonts from CSS variables, so diagrams follow your theme without rendering again. Set them on `.pele` or any ancestor:

```css
.streamdown {
  --pele-bg: transparent;
  --pele-fg: #1f2328;
  --pele-muted: #59636e;
  --pele-line: #8c959f;
  --pele-surface: #f6f8fa;
  --pele-surface-alt: #eaeef2;
  --pele-border: #d1d9e0;
  --pele-accent: #0969da;
}
```

Charts also use `--pele-series-1` through `--pele-series-8`.

## Behavior notes

- Diagram types load on demand through `pele/lazy`, so only the types a page uses are downloaded.
- Streamdown passes Mermaid.js configuration to `getMermaid()`. Pele has its own options, so that configuration is ignored.
- Invalid or incomplete syntax throws a `PeleError`, which Streamdown handles the same way it handles Mermaid.js errors. `PeleError` is re-exported from this package.

## License

MIT. Pele is also MIT licensed.
