<img src="packages/web/public/memora-with-title.png" alt="Memora" width="220"/>

Memora is a local-first workspace for learning across documents, audio, images, and video. It is under rapid development, and both APIs and features may change significantly.

## Overview

- Main app: `@memora/web`
- Supporting packages: `@memora/ai-core`, `@memora/ai-extension-skills`, `@memora/ai-provider-pi`, `@memora/datasets`, `@memora/evaluation`, `@memora/fs`, `@memora/livestore-devtool`, `@memora/local-model-runtime`

## Getting Started

If you are working with the project’s agent-driven development flow, install the required skills and superpowers first.

```bash
vp install
pnpm dev
```

The main web app runs on `http://localhost:9003`.

## Common Commands

```bash
pnpm dev
pnpm build
pnpm lint:web
pnpm test:web
```

You can also work on the main app directly:

```bash
vp run -t @memora/web#dev
vp run -t @memora/web#build
pnpm --filter @memora/web lint
vp --filter @memora/web preview
```

## Workspace

```text
packages/
  web/                   Main frontend application
  ai-core/               Shared AI orchestration logic
  ai-extensions/skills/  Agent skill extensions
  ai-provider/pi/        AI provider integration
  datasets/              Dataset management
  evaluation/            Model/metric evaluation tooling
  fs/                    Shared filesystem-related logic
  livestore-devtool/     LiveStore devtools panel
  local-model-runtime/   Local model runtime (ASR/LLM handlers)
```

## Notes

- Routing in the web app is built with `react-router` and `vite-plugin-route-builder`.
- `packages/web/src/generated-routes.ts` is generated and should not be edited manually.
- Static AI-related assets are copied during the web build.
