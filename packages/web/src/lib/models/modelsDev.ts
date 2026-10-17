import {
  findModelsDevMetadata,
  MODELS_DEV_URL,
  parseModelsDevCatalog,
  type ModelMetadata,
  type ModelsDevCatalog,
} from "./modelsDevCatalog";

let snapshot: Promise<ModelsDevCatalog> | undefined;
let latest: ModelsDevCatalog | undefined;
let refreshing: Promise<void> | undefined;
let refreshAfter = 0;
const REFRESH_COOLDOWN_MS = 5 * 60_000;

const refreshCatalog = (): Promise<void> => {
  if (refreshing) return refreshing;
  if (Date.now() < refreshAfter) return Promise.resolve();
  refreshing = (async () => {
    try {
      const response = await fetch(MODELS_DEV_URL, {
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`models.dev returned HTTP ${response.status}.`);
      latest = parseModelsDevCatalog(await response.json());
    } catch {
      // Catalog availability must not prevent using a provider's model list.
    } finally {
      refreshAfter = Date.now() + REFRESH_COOLDOWN_MS;
      refreshing = undefined;
    }
  })();
  return refreshing;
};

export const loadModelsDevMetadata = async (
  baseUrl: string,
  modelIds: string[],
): Promise<(modelId: string) => ModelMetadata | undefined> => {
  snapshot ??= import("virtual:models-dev-catalog").then((module) => module.default);
  const bundled = await snapshot.catch(() => [] as ModelsDevCatalog);
  const lookup = (id: string) =>
    (latest && findModelsDevMetadata(latest, baseUrl, id)) ??
    findModelsDevMetadata(bundled, baseUrl, id);
  if (modelIds.some((id) => !lookup(id))) await refreshCatalog();
  return lookup;
};
