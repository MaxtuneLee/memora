import { Schema } from "@livestore/livestore";
import { describe, expect, test } from "vite-plus/test";

import {
  legacyProviderEvents,
  providerEvents,
  providerTable,
  toProviderMetadata,
} from "@/livestore/provider";
import { providerCredentialEvents, readProviderApiKey } from "@/livestore/providerCredential";
import { parseProviderModel } from "@/lib/settings/dialogHelpers";
import { normalizeProviderEndpoint } from "@/lib/settings/providerEndpoint";

const provider = {
  id: "provider-a",
  name: "Cloud",
  baseUrl: "https://example.test/v1",
  apiFormat: "responses" as const,
  models: "[]",
  createdAt: new Date(0),
  updatedAt: new Date(0),
  deletedAt: null,
};

describe("device-local provider credentials", () => {
  test("credentials cannot be saved in synced endpoint URLs", () => {
    expect(() => normalizeProviderEndpoint("https://user:secret@example.test/v1")).toThrow(
      "API key field",
    );
    expect(() => normalizeProviderEndpoint("https://example.test/v1?key=secret")).toThrow(
      "API key field",
    );
    expect(
      toProviderMetadata({
        ...provider,
        baseUrl: "https://user:secret@example.test/v1?token=secret",
      }).baseUrl,
    ).toBe(provider.baseUrl);
  });
  test("model metadata cannot carry request headers or arbitrary sampling secrets", () => {
    const model = {
      id: "text-model",
      headers: { Authorization: "Bearer secret" },
      samplingParams: { temperature: 0.3, apiKey: "secret", headers: { token: "secret" } },
    };
    expect(parseProviderModel(model)).toMatchObject({
      id: "text-model",
      samplingParams: { temperature: 0.3 },
    });
    expect(JSON.stringify(parseProviderModel(model))).not.toContain("secret");
    expect(
      toProviderMetadata({ ...provider, models: JSON.stringify([model]) }).models,
    ).not.toContain("secret");
  });
  test("credential writes and deletes never enter the sync stream", () => {
    expect(providerCredentialEvents.providerCredentialSet.options.clientOnly).toBe(true);
    expect(providerCredentialEvents.providerCredentialDeleted.options.clientOnly).toBe(true);
    expect(providerEvents.providerCreated.options.clientOnly).toBe(false);
    expect(providerEvents.providerUpdated.options.clientOnly).toBe(false);
    expect(providerTable.sqliteDef.columns).not.toHaveProperty("apiKey");
  });

  test("new and legacy provider schemas discard credential fields", () => {
    const encoded = {
      ...provider,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      apiKey: "historical-secret",
    };
    for (const event of [
      providerEvents.providerCreated,
      legacyProviderEvents.legacyProviderCreated,
    ]) {
      const decoded = Schema.decodeUnknownSync(event.schema)(encoded);
      expect(decoded).not.toHaveProperty("apiKey");
      expect(decoded.id).toBe(provider.id);
    }
    for (const event of [
      providerEvents.providerUpdated,
      legacyProviderEvents.legacyProviderUpdated,
    ]) {
      expect(Schema.decodeUnknownSync(event.schema)(encoded)).not.toHaveProperty("apiKey");
    }
  });

  test("a key is usable only for its provider and endpoint", () => {
    const credentials = [
      { providerId: provider.id, baseUrl: `${provider.baseUrl}/`, apiKey: "local-secret" },
    ];
    expect(readProviderApiKey(provider, credentials)).toBe("local-secret");
    expect(readProviderApiKey({ ...provider, id: "provider-b" }, credentials)).toBe("");
    expect(readProviderApiKey({ ...provider, baseUrl: "https://other.test/v1" }, credentials)).toBe(
      "",
    );
    expect(readProviderApiKey(provider, [])).toBe("");
  });

  test("export projection excludes secrets even from stale provider records", () => {
    const legacy = { ...provider, apiKey: "old-secret", credentials: { token: "another-secret" } };
    expect(toProviderMetadata(legacy)).toEqual(provider);
    expect(JSON.stringify(toProviderMetadata(legacy))).not.toContain("secret");
  });
});
