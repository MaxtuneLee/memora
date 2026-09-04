import { Events, Schema } from "@livestore/livestore";

import { modelRoutingSchema, type StoredModelRouting } from "@/lib/models/modelRoutingSchema";
import { defaultSettings } from "./setting";

// Replay the former document's events into settings without recreating its table.
export const legacyModelRoutingEvents = {
  legacyModelRoutingSet: Events.clientOnly({
    name: "ai_model_routingSet",
    schema: Schema.Struct({ id: Schema.String, value: Schema.partial(modelRoutingSchema) }),
  }),
};

export const legacyModelRoutingMaterializers = {
  ai_model_routingSet: ({ id, value }: { id: string; value: StoredModelRouting }) => {
    if (id !== "feature-models") return [];
    const entries = Object.entries(value).filter(([, route]) => route !== undefined);
    if (entries.length === 0) return [];

    // Replace each complete route, preserving other features and unrelated settings.
    let update = "value";
    const bindings: string[] = [];
    for (const [feature, route] of entries) {
      update = `json_set(${update}, ?, json(?))`;
      bindings.push(`$.modelRouting.${feature}`, JSON.stringify(route));
    }
    return {
      sql: `INSERT INTO settings (id, value) VALUES (?, ?)
        ON CONFLICT (id) DO UPDATE SET value = ${update}`,
      bindValues: [
        "user-settings",
        JSON.stringify({ ...defaultSettings, modelRouting: value }),
        ...bindings,
      ],
      writeTables: new Set(["settings"]),
    };
  },
};
