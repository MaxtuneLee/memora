import { describe, expect, test } from "vite-plus/test";

import { widgetMaterializers } from "@/livestore/widget";

describe("widget materializers", () => {
  test("a built-in definition another device already created is skipped, not a crash", () => {
    const write = widgetMaterializers["v1.WidgetDefinitionCreated"]({
      id: "builtin:calendar",
      kind: "builtin",
      builtinKey: "calendar",
      name: "Calendar",
      createdAt: new Date(0),
    });
    expect(write.asSql().query).toMatch(/ON CONFLICT \("id"\) DO NOTHING/);
  });
});
