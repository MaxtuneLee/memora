---
name: opfs-fs
description: "Use when: OPFS filesystem access, shell-like file operations, globbing, or replacing opfs-tools in the memora codebase."
---

# OPFS FS Skill

Use `@memora/fs` to read, write, and manage OPFS data with a shell-like API.

## Core API

- `dir(path)` / `file(path)` wrappers for OPFS handles.
- `write(path, data, options)` to save data.
- `cat(path)` for text content.
- `mkdir`, `ls`, `stat`, `rm`, `cp`, `mv` for basic filesystem actions.
- `glob(pattern, options)` for path matching.

## Examples

```ts
import { dir, file, glob, write } from "@memora/fs";

await dir("/transformers-cache").create();
await write("/transformers-cache/example.bin", new Uint8Array([1, 2, 3]));
const exists = await file("/transformers-cache/example.bin").exists();
const matches = await glob("/transformers-cache/**/*.bin", { files: true });
```
