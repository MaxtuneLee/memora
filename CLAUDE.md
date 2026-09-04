# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
pnpm install

# Dev server (port 9003)
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

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->
