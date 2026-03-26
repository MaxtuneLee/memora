import { Events, Schema, State } from "@livestore/livestore";

type ProviderCreatedEvent = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  apiFormat: "chat-completions" | "responses";
  createdAt: Date;
};

type ProviderUpdatedEvent = {
  id: string;
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  apiFormat?: "chat-completions" | "responses";
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
    apiKey: State.SQLite.text({ default: "" }),
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

export const providerEvents = {
  providerCreated: Events.synced({
    name: "v1.ProviderCreated",
    schema: Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      baseUrl: Schema.String,
      apiKey: Schema.String,
      apiFormat: ApiFormatSchema,
      createdAt: Schema.Date,
    }),
  }),
  providerUpdated: Events.synced({
    name: "v1.ProviderUpdated",
    schema: Schema.Struct({
      id: Schema.String,
      name: Schema.optional(Schema.String),
      baseUrl: Schema.optional(Schema.String),
      apiKey: Schema.optional(Schema.String),
      apiFormat: Schema.optional(ApiFormatSchema),
      models: Schema.optional(Schema.String),
      updatedAt: Schema.Date,
    }),
  }),
  providerDeleted: Events.synced({
    name: "v1.ProviderDeleted",
    schema: Schema.Struct({
      id: Schema.String,
      deletedAt: Schema.Date,
    }),
  }),
};

export const providerMaterializers = {
  "v1.ProviderCreated": (event: ProviderCreatedEvent) =>
    providerTable.insert({
      id: event.id,
      name: event.name,
      baseUrl: event.baseUrl,
      apiKey: event.apiKey,
      apiFormat: event.apiFormat,
      createdAt: event.createdAt,
      updatedAt: event.createdAt,
    }),
  "v1.ProviderUpdated": (event: ProviderUpdatedEvent & { models?: string }) =>
    providerTable
      .update({
        ...(event.name !== undefined ? { name: event.name } : {}),
        ...(event.baseUrl !== undefined ? { baseUrl: event.baseUrl } : {}),
        ...(event.apiKey !== undefined ? { apiKey: event.apiKey } : {}),
        ...(event.apiFormat !== undefined ? { apiFormat: event.apiFormat } : {}),
        ...(event.models !== undefined ? { models: event.models } : {}),
        updatedAt: event.updatedAt,
      })
      .where({ id: event.id }),
  "v1.ProviderDeleted": (event: ProviderDeletedEvent) =>
    providerTable
      .update({
        deletedAt: event.deletedAt,
      })
      .where({ id: event.id }),
};

export type provider = typeof providerTable.Type;
