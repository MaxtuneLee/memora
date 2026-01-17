import { Schema, SessionIdSymbol, State } from "@livestore/livestore";

export const uiTable = State.SQLite.clientDocument({
  name: "uiState",
  schema: Schema.Struct({
    selectedFileId: Schema.optional(Schema.String),
    selectedCollectionId: Schema.optional(Schema.String),
    viewMode: Schema.Literal("grid", "list"),
    sortBy: Schema.Literal("name", "createdAt", "type"),
    sortOrder: Schema.Literal("asc", "desc"),
  }),
  default: {
    id: SessionIdSymbol,
    value: {
      selectedFileId: undefined,
      selectedCollectionId: undefined,
      viewMode: "grid",
      sortBy: "createdAt",
      sortOrder: "desc",
    },
  },
});

export const uiEvents = {
  uiStateSet: uiTable.set,
};
