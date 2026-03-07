# @memora/fs

OPFS filesystem utilities with a shell-like API.

## Usage

```ts
import { cat, cp, dir, file, glob, ls, mkdir, mv, rm, stat, write } from "@memora/fs";

await mkdir("/recordings", { recursive: true });
await write("/recordings/notes.txt", "hello", { overwrite: true });
const content = await cat("/recordings/notes.txt");
const items = await ls("/recordings");
const jsonFiles = await glob("/recordings/**/*.json", { files: true });
await cp("/recordings/notes.txt", "/recordings/notes-copy.txt");
await mv("/recordings/notes-copy.txt", "/recordings/archived.txt");
const info = await stat("/recordings/archived.txt");
await rm("/recordings/archived.txt", { force: true });
```

## API

- `dir(path)` -> directory handle wrapper with `exists`, `create`, `children`, `remove`.
- `file(path)` -> file handle wrapper with `exists`, `text`, `arrayBuffer`, `getOriginFile`, `getSize`, `remove`.
- `write(path, data, options)` -> write data to OPFS.
- `cat(path)` -> read text content.
- `mkdir(path, options)` -> create directories.
- `ls(path, options)` -> list entries.
- `stat(path)` -> return basic metadata.
- `rm(path, options)` -> remove file or directory.
- `cp(from, to, options)` -> copy file or directory.
- `mv(from, to, options)` -> move file or directory.
- `glob(pattern, options)` -> match paths.
