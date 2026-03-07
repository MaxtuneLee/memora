# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
pnpm install

# Dev server (port 9000)
pnpm --filter @memora/web dev

# Build web app (runs tsc -b then vite build)
pnpm --filter @memora/web build

# Lint
pnpm --filter @memora/web lint

# Build @memora/fs package
pnpm --filter @memora/fs build

# Dev watch for @memora/fs
pnpm --filter @memora/fs dev
```

No test scripts are currently defined.

## Architecture

**Monorepo** managed with pnpm workspaces. Two packages:

### `packages/web` (`@memora/web`)
Local-first, privacy-focused app for managing multi-modal content (audio, video, images, documents). React 19 + Vite (rolldown-vite) + Tailwind CSS v4.

- **Routing**: File-system based via `vite-plugin-route-builder`. Pages in `src/pages/` auto-generate `src/generated-routes.ts` (do not edit).
- **State**: LiveStore (event-sourced SQLite in the browser via OPFS). Schema defined in `src/livestore/` with tables for files, folders, collections, settings, and UI state. Events are defined with `Events.synced()` and materialized into SQLite tables.
- **File storage**: Binary files stored in OPFS via `@memora/fs`. Metadata in `{id}.meta.json`, transcripts in `{id}.transcript.json`, all under `/files/{id}/` directory. The `src/lib/fileStorage.ts` module handles CRUD operations.
- **Transcription**: Whisper model runs client-side via `@huggingface/transformers` in a web worker (`src/workers/whisper.worker.ts`). Uses WebGPU acceleration and caches ONNX models in OPFS.
- **VAD**: Voice Activity Detection via `@ricky0123/vad-react` with static assets (ONNX models, WASM) copied at build time.
- **Desktop feature**: `src/features/desktop/` implements a desktop-like UI with draggable icons, folders, windows, context menus, and trash. Uses `@dnd-kit/core`.
- **UI**: `@base-ui/react` for primitives (toasts, dialogs). `@phosphor-icons/react` for icons. `motion` for animations. `tailwind-merge` + `clsx` via `src/lib/cn.ts` for class merging.
- **Path alias**: `@/` maps to `packages/web/src/`.
- **React Compiler**: Enabled via `babel-plugin-react-compiler`.

### `packages/fs` (`@memora/fs`)
OPFS filesystem utilities with shell-like API (`cat`, `cp`, `ls`, `mkdir`, `mv`, `rm`, `stat`, `write`, `glob`, `dir`, `file`). Built with `tsdown`.

## Code Style

- Double quotes, semicolons, trailing commas.
- `type` for unions/intersections, `interface` for object shapes.
- `camelCase.ts` for utilities, `PascalCase.tsx` for components.
- Function components only. `strict: true` TypeScript. Avoid `any`.
- Group imports: React/third-party first, then internal (`./`, `../`).
- LiveStore events follow `v1.EntityAction` naming (e.g., `v1.FileCreated`).
