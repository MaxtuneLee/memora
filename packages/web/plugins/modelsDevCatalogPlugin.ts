import { readFile } from "node:fs/promises";
import type { Plugin } from "vite";

import { parseModelsDevCatalog, type ModelsDevCatalog } from "../src/lib/models/modelsDevCatalog";

const MODULE_ID = "virtual:models-dev-catalog";
const RESOLVED_ID = `\0${MODULE_ID}`;
const SNAPSHOT_URL = new URL("../models-dev.snapshot.json", import.meta.url);

export const modelsDevCatalogPlugin = (): Plugin => {
  let build = false;
  let catalog: Promise<ModelsDevCatalog> | undefined;
  return {
    name: "memora-models-dev-catalog",
    configResolved(config) {
      build = config.command === "build";
    },
    resolveId(id) {
      if (id === MODULE_ID) return RESOLVED_ID;
    },
    async load(id) {
      if (id !== RESOLVED_ID) return;
      catalog ??= (async () => {
        if (build) {
          try {
            const response = await fetch("https://models.dev/api.json", {
              credentials: "omit",
              redirect: "error",
              referrerPolicy: "no-referrer",
              signal: AbortSignal.timeout(30_000),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return parseModelsDevCatalog(await response.json());
          } catch (error) {
            this.warn(`Could not refresh models.dev; using the saved snapshot. ${String(error)}`);
          }
        }
        return JSON.parse(await readFile(SNAPSHOT_URL, "utf8")) as ModelsDevCatalog;
      })();
      return `export default ${JSON.stringify(await catalog)};`;
    },
  };
};
