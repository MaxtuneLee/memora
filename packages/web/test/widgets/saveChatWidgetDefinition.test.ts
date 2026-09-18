import { expect, test, vi } from "vite-plus/test";

import { saveChatWidgetDefinition } from "@/lib/widgets/saveChatWidgetDefinition";

test("commits a generated definition with its chat widget source and catalog binding", () => {
  const store = { commit: vi.fn() };

  const result = saveChatWidgetDefinition({
    store,
    input: {
      id: "widget-definition-1",
      name: "Recent research",
      widgetCode: "<div>Recent research</div>",
      dataSourceName: "recentFiles",
      dataSourceParams: { limit: 3 },
    },
  });

  expect(result).toEqual({ ok: true });
  expect(store.commit).toHaveBeenCalledTimes(1);
  const committed = store.commit.mock.calls[0]?.[0];
  expect(committed).toMatchObject({
    name: "v1.WidgetDefinitionCreated",
    args: {
      id: "widget-definition-1",
      kind: "generated",
      name: "Recent research",
      widgetCode: "<div>Recent research</div>",
      dataSourceName: "recentFiles",
      dataSourceParams: JSON.stringify({ limit: 3 }),
    },
  });
  expect(committed?.args.createdAt).toBeInstanceOf(Date);
});

test("rejects a chat widget definition without a catalog binding", () => {
  const store = { commit: vi.fn() };

  const result = saveChatWidgetDefinition({
    store,
    input: {
      id: "widget-definition-1",
      name: "Recent research",
      widgetCode: "<div>Recent research</div>",
    },
  });

  expect(result).toEqual({ ok: false, reason: "missing-data-source" });
  expect(store.commit).not.toHaveBeenCalled();
});
