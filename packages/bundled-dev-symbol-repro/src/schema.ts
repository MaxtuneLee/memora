import { makeSchema, Schema, State } from "@livestore/livestore";

const todos = State.SQLite.table({
  name: "todos",
  columns: {
    id: State.SQLite.text({ primaryKey: true }),
    text: State.SQLite.text({ default: "", nullable: false }),
    completed: State.SQLite.boolean({ default: false, nullable: false }),
  },
});

const app = State.SQLite.clientDocument({
  name: "app",
  schema: Schema.Struct({
    newTodoText: Schema.String,
    filter: Schema.String,
  }),
  default: { value: { newTodoText: "", filter: "all" } },
});

const tables = { todos, app };
const state = State.SQLite.makeState({ tables, materializers: {} });

export const schema = makeSchema({ state, events: {} });
