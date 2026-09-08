import { file, ls, mkdir, write } from "@memora/fs";

export interface ResultStorage {
  write(path: string, data: string): Promise<void>;
  readText(path: string): Promise<string>;
  list(path: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
}

export const opfsResultStorage: ResultStorage = {
  exists: (path) => file(path).exists(),
  readText: (path) => file(path).text(),
  async write(path, data) {
    const parent = path.slice(0, path.lastIndexOf("/")) || "/";
    await mkdir(parent, { recursive: true });
    await write(path, data, { overwrite: true });
  },
  list: async (path) => {
    try {
      return await ls(path, { recursive: true, includeDirs: false });
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") return [];
      throw error;
    }
  },
};
