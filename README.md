<img src="packages/web/public/memora-with-title.png" alt="Memora" width="220"/>


Memora is a local-first workspace for learning across documents, audio, images, and video. It is under rapid development, and both APIs and features may change significantly.

## Overview

- Main app: `@memora/web`
- Supporting packages: `@memora/ai-core`, `@memora/fs`

## Getting Started

If you are working with the project’s agent-driven development flow, install the required skills and superpowers first.

```bash
vp install
pnpm dev:web
```

The main web app runs on `http://localhost:9001`.

## Common Commands

```bash
pnpm dev:web
pnpm build:web
pnpm lint:web
```

You can also work on the main app directly:

```bash
pnpm --filter @memora/web dev
pnpm --filter @memora/web build
pnpm --filter @memora/web lint
pnpm --filter @memora/web preview
```

## Workspace

```text
packages/
  web/       Main frontend application
  ai-core/   Shared AI-related logic
  fs/        Shared filesystem-related logic
```

## Notes

- Routing in the web app is built with `react-router` and `vite-plugin-route-builder`.
- `packages/web/src/generated-routes.ts` is generated and should not be edited manually.
- Static AI-related assets are copied during the web build.
