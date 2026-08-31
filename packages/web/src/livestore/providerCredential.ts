import { Events, Schema, State, queryDb } from "@livestore/livestore";

import type { provider } from "./provider";

// Device-local state only. Never include this table in workspace exports.
export const providerCredentialTable = State.SQLite.table({
  name: "provider_credentials",
  columns: {
    providerId: State.SQLite.text({ primaryKey: true }),
    baseUrl: State.SQLite.text(),
    apiKey: State.SQLite.text(),
  },
});

export const providerCredentialEvents = {
  providerCredentialSet: Events.clientOnly({
    name: "v1.ProviderCredentialSet",
    schema: Schema.Struct({
      providerId: Schema.String,
      baseUrl: Schema.String,
      apiKey: Schema.String,
    }),
  }),
  providerCredentialDeleted: Events.clientOnly({
    name: "v1.ProviderCredentialDeleted",
    schema: Schema.Struct({ providerId: Schema.String }),
  }),
};

export const providerCredentialMaterializers = {
  "v1.ProviderCredentialSet": (event: typeof providerCredentialTable.Type) =>
    providerCredentialTable.insert(event).onConflict("providerId", "replace"),
  "v1.ProviderCredentialDeleted": ({ providerId }: { providerId: string }) =>
    providerCredentialTable.delete().where({ providerId }),
};

export const providerCredentialsQuery$ = queryDb(() => providerCredentialTable, {
  label: "providers:device-credentials",
});

const normalizeEndpoint = (value: string): string => value.trim().replace(/\/+$/, "");

export const readProviderApiKey = (
  provider: Pick<provider, "id" | "baseUrl">,
  credentials: readonly (typeof providerCredentialTable.Type)[],
): string => {
  const credential = credentials.find((row) => row.providerId === provider.id);
  return credential && normalizeEndpoint(credential.baseUrl) === normalizeEndpoint(provider.baseUrl)
    ? credential.apiKey
    : "";
};
