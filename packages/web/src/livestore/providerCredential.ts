import { Events, Schema, State, queryDb } from "@livestore/livestore";

import { isPasskeySealed, peekApiKey } from "@/lib/settings/credentialVault";
import type { provider } from "./provider";

// Never include this table in workspace exports. apiKey holds a key sealed by credentialVault;
// rows written before encryption hold plaintext. Only passkey-sealed keys sync between devices
// (see providerCredentialEvents); device-sealed and plaintext keys stay on this device.
export const providerCredentialTable = State.SQLite.table({
  name: "provider_credentials",
  columns: {
    providerId: State.SQLite.text({ primaryKey: true }),
    baseUrl: State.SQLite.text(),
    apiKey: State.SQLite.text(),
  },
});

const credentialSchema = Schema.Struct({
  providerId: Schema.String,
  baseUrl: Schema.String,
  apiKey: Schema.String,
});
const credentialIdSchema = Schema.Struct({ providerId: Schema.String });

/** Event definitions for the schema. */
export const providerCredentialEventDefs = {
  providerCredentialSet: Events.clientOnly({
    name: "v1.ProviderCredentialSet",
    schema: credentialSchema,
  }),
  providerCredentialDeleted: Events.clientOnly({
    name: "v1.ProviderCredentialDeleted",
    schema: credentialIdSchema,
  }),
  sharedProviderCredentialSet: Events.synced({
    name: "v2.ProviderCredentialSet",
    schema: credentialSchema,
  }),
  sharedProviderCredentialDeleted: Events.synced({
    name: "v2.ProviderCredentialDeleted",
    schema: credentialIdSchema,
  }),
};

const defs = providerCredentialEventDefs;

export const providerCredentialEvents = {
  /**
   * Saves a key. A passkey-sealed key syncs, because another device with the same passkey can
   * open it; a device-sealed or plaintext key stays on this device.
   */
  providerCredentialSet: (credential: typeof providerCredentialTable.Type) =>
    isPasskeySealed(credential.apiKey)
      ? defs.sharedProviderCredentialSet(credential)
      : defs.providerCredentialSet(credential),
  /** Removes a provider's key on every device. */
  providerCredentialDeleted: (credential: { providerId: string }) =>
    defs.sharedProviderCredentialDeleted(credential),
  /** Removes a key on this device only, for example when its passkey is lost here. */
  providerCredentialDeletedHere: (credential: { providerId: string }) =>
    defs.providerCredentialDeleted(credential),
};

const setCredential = (event: typeof providerCredentialTable.Type) =>
  providerCredentialTable.insert(event).onConflict("providerId", "replace");
const deleteCredential = ({ providerId }: { providerId: string }) =>
  providerCredentialTable.delete().where({ providerId });

export const providerCredentialMaterializers = {
  "v1.ProviderCredentialSet": setCredential,
  "v1.ProviderCredentialDeleted": deleteCredential,
  "v2.ProviderCredentialSet": setCredential,
  "v2.ProviderCredentialDeleted": deleteCredential,
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
    ? peekApiKey(credential.apiKey)
    : "";
};
