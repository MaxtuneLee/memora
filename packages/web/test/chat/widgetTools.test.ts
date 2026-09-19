import * as v from "valibot";
import { expect, test } from "vite-plus/test";

import { SHOW_WIDGET_TOOL_NAME } from "@/lib/chat/showWidget";
import { createWidgetTools } from "@/lib/chat/tools/widgetTools";
import { DATA_SOURCE_CATALOG } from "@/lib/widgets/dataSourceCatalog";

const getShowWidgetTool = () => {
  const tool = createWidgetTools({}).find((candidate) => candidate.name === SHOW_WIDGET_TOOL_NAME);
  if (!tool) {
    throw new Error(`${SHOW_WIDGET_TOOL_NAME} tool was not registered`);
  }
  return tool;
};

test("show_widget description documents every catalog entry name", () => {
  const tool = getShowWidgetTool();

  for (const entry of DATA_SOURCE_CATALOG) {
    expect(tool.description).toContain(entry.name);
  }
  expect(tool.description).toContain("data_source");
  expect(tool.description).toContain("data_source_params");
});

test("show_widget accepts a call with no data source binding", () => {
  const tool = getShowWidgetTool();
  const parsed = v.parse(tool.parameters as v.GenericSchema, {
    i_have_seen_read_me: true,
    title: "Untitled",
    loading_messages: [],
    widget_code: "<div></div>",
  });

  expect(parsed).toMatchObject({ title: "Untitled" });
});

test("show_widget accepts a catalog data_source with data_source_params", () => {
  const tool = getShowWidgetTool();
  const parsed = v.parse(tool.parameters as v.GenericSchema, {
    i_have_seen_read_me: true,
    title: "Recent files",
    loading_messages: [],
    widget_code: "<div></div>",
    data_source: "recentFiles",
    data_source_params: { limit: 8 },
  });

  expect(parsed).toMatchObject({ data_source: "recentFiles", data_source_params: { limit: 8 } });
});

test("show_widget accepts data_files declaring the widget's own persisted file names", () => {
  const tool = getShowWidgetTool();
  const parsed = v.parse(tool.parameters as v.GenericSchema, {
    i_have_seen_read_me: true,
    title: "Habit tracker",
    loading_messages: [],
    widget_code: "<div></div>",
    data_source: "widgetData",
    data_files: ["state.json"],
  });

  expect(parsed).toMatchObject({ data_source: "widgetData", data_files: ["state.json"] });
});

test("show_widget rejects a data_source name outside the catalog", () => {
  const tool = getShowWidgetTool();

  expect(() =>
    v.parse(tool.parameters as v.GenericSchema, {
      i_have_seen_read_me: true,
      title: "Untitled",
      loading_messages: [],
      widget_code: "<div></div>",
      data_source: "raw-sql",
    }),
  ).toThrow();
});
