import { expect, test } from "vite-plus/test";

import { normalizeChatWidget, sanitizeShowWidgetArguments } from "@/lib/chat/showWidget";

test("sanitizeShowWidgetArguments keeps a catalog data_source and its params", () => {
  const result = sanitizeShowWidgetArguments({
    title: "Recent files",
    widget_code: "<div></div>",
    data_source: "recentFiles",
    data_source_params: { limit: 8 },
  });

  expect(result.data_source).toBe("recentFiles");
  expect(result.data_source_params).toEqual({ limit: 8 });
});

test("sanitizeShowWidgetArguments drops a data_source name outside the catalog", () => {
  const result = sanitizeShowWidgetArguments({
    title: "Untitled",
    widget_code: "<div></div>",
    data_source: "raw-sql",
  });

  expect(result.data_source).toBeUndefined();
});

test("sanitizeShowWidgetArguments drops a non-object data_source_params", () => {
  const result = sanitizeShowWidgetArguments({
    title: "Untitled",
    widget_code: "<div></div>",
    data_source_params: "not-an-object",
  });

  expect(result.data_source_params).toBeUndefined();
});

test("normalizeChatWidget round-trips a persisted data source binding", () => {
  const widget = normalizeChatWidget({
    toolCallId: "call-1",
    title: "Recent files",
    loadingMessages: [],
    widgetCode: "<div></div>",
    phase: "ready",
    dataSourceName: "recentFiles",
    dataSourceParams: { limit: 8 },
  });

  expect(widget).toMatchObject({
    dataSourceName: "recentFiles",
    dataSourceParams: { limit: 8 },
  });
});

test("normalizeChatWidget drops an unrecognized persisted data source name", () => {
  const widget = normalizeChatWidget({
    toolCallId: "call-1",
    title: "Untitled",
    loadingMessages: [],
    widgetCode: "<div></div>",
    phase: "ready",
    dataSourceName: "raw-sql",
  });

  expect(widget?.dataSourceName).toBeUndefined();
});
