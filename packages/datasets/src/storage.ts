import { file, ls, mkdir, rm, writeStream, write } from "@memora/fs";

import type { DatasetStorage } from "./types";

export const opfsDatasetStorage: DatasetStorage = {
  exists: (path) => file(path).exists(),
  readText: (path) => file(path).text(),
  readFile: (path) => file(path).getOriginFile(),
  size: (path) => file(path).getSize(),
  async write(path, data) {
    const parent = path.slice(0, path.lastIndexOf("/")) || "/";
    await mkdir(parent, { recursive: true });
    if (typeof data === "string") await write(path, data, { overwrite: true });
    else await writeStream(path, data, { overwrite: true });
  },
  remove: (path, options) => rm(path, { force: true, recursive: options?.recursive }),
  list: async (path) => {
    try {
      return await ls(path, { recursive: true, includeDirs: false });
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") return [];
      throw error;
    }
  },
  estimate: async () => navigator.storage.estimate(),
};
