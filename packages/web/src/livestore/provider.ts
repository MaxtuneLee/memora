import { Events, Schema, State } from "@livestore/livestore";
import { parseProviderModels } from "@/lib/settings/dialogHelpers";
import { redactProviderEndpoint } from "@/lib/settings/providerEndpoint";

export type ProviderApiFormat = "chat-completions" | "responses";

type ProviderCreatedEvent = {
  id: string;
  name: string;
  baseUrl: string;
  apiFormat: ProviderApiFormat;
  models?: string;
  createdAt: Date;
};

type ProviderUpdatedEvent = {
  id: string;
  name?: string;
  baseUrl?: string;
  apiFormat?: ProviderApiFormat;
  models?: string;
  updatedAt: Date;
};

type ProviderDeletedEvent = {
  id: string;
  deletedAt: Date;
};

const ApiFormatSchema = Schema.Literal("chat-completions", "responses");

export const providerTable = State.SQLite.table({
  name: "providers",
  columns: {
    id: State.SQLite.text({ primaryKey: true }),
    name: State.SQLite.text({ default: "" }),
    baseUrl: State.SQLite.text({ default: "" }),
    apiFormat: State.SQLite.text({
      default: "chat-completions",
      schema: ApiFormatSchema,
    }),
    models: State.SQLite.text({ default: "[]" }),
    createdAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
    updatedAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
    deletedAt: State.SQLite.integer({
      nullable: true,
      schema: Schema.DateFromNumber,
    }),
  },
});

const providerCreatedSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  baseUrl: Schema.String,
  apiFormat: ApiFormatSchema,
  models: Schema.optional(Schema.String),
  createdAt: Schema.Date,
});
const providerUpdatedSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.optional(Schema.String),
  baseUrl: Schema.optional(Schema.String),
  apiFormat: Schema.optional(ApiFormatSchema),
  models: Schema.optional(Schema.String),
  updatedAt: Schema.Date,
});

// Preserve old event names for replay, discarding historical credential fields.
// Existing remote event logs still require cleanup and credential rotation.
export const legacyProviderEvents = {
  legacyProviderCreated: Events.synced({
    name: "v1.ProviderCreated",
    schema: providerCreatedSchema,
  }),
  legacyProviderUpdated: Events.synced({
    name: "v1.ProviderUpdated",
    schema: providerUpdatedSchema,
  }),
};

export const providerEvents = {
  providerCreated: Events.synced({ name: "v2.ProviderCreated", schema: providerCreatedSchema }),
  providerUpdated: Events.synced({
    name: "v2.ProviderUpdated",
    schema: providerUpdatedSchema,
  }),
  providerDeleted: Events.synced({
    name: "v1.ProviderDeleted",
    schema: Schema.Struct({
      id: Schema.String,
      deletedAt: Schema.Date,
    }),
  }),
};

const materializeProviderCreated = (event: ProviderCreatedEvent) =>
  providerTable.insert({
    id: event.id,
    name: event.name,
    baseUrl: redactProviderEndpoint(event.baseUrl),
    apiFormat: event.apiFormat,
    models: JSON.stringify(parseProviderModels({ models: event.models ?? "[]" })),
    createdAt: event.createdAt,
    updatedAt: event.createdAt,
  });
const materializeProviderUpdated = (event: ProviderUpdatedEvent) =>
  providerTable
    .update({
      ...(event.name !== undefined ? { name: event.name } : {}),
      ...(event.baseUrl !== undefined ? { baseUrl: redactProviderEndpoint(event.baseUrl) } : {}),
      ...(event.apiFormat !== undefined ? { apiFormat: event.apiFormat } : {}),
      ...(event.models !== undefined
        ? { models: JSON.stringify(parseProviderModels({ models: event.models })) }
        : {}),
      updatedAt: event.updatedAt,
    })
    .where({ id: event.id });

export const providerMaterializers = {
  "v1.ProviderCreated": materializeProviderCreated,
  "v1.ProviderUpdated": materializeProviderUpdated,
  "v2.ProviderCreated": materializeProviderCreated,
  "v2.ProviderUpdated": materializeProviderUpdated,
  "v1.ProviderDeleted": (event: ProviderDeletedEvent) =>
    providerTable
      .update({
        deletedAt: event.deletedAt,
      })
      .where({ id: event.id }),
};

export type provider = typeof providerTable.Type;

// Explicit projection protects exports from stale objects containing old secrets.
export const toProviderMetadata = (row: provider): provider => ({
  id: row.id,
  name: row.name,
  baseUrl: redactProviderEndpoint(row.baseUrl),
  apiFormat: row.apiFormat,
  models: JSON.stringify(parseProviderModels(row)),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  deletedAt: row.deletedAt,
});
