import type { Store } from "@livestore/livestore";

import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { normalizeAiModelRouting } from "./modelRouting";
import { createEmbeddingRuntime, type EmbeddingRuntime } from "./embeddingRuntime";

// Resolve at task execution time. Neither credentials nor runtime objects enter
// persistent task payloads, and queued work respects the current device setting.
export const readEmbeddingRuntime = (store: Pick<Store, "query">): EmbeddingRuntime | null => {
  const settings = store.query(settingsDocumentQuery$);
  if (settings?.semanticSearchEnabled !== true) return null;
  return createEmbeddingRuntime(normalizeAiModelRouting(settings.modelRouting, settings).embedding);
};
