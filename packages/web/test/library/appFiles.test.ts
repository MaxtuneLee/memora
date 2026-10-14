import { describe, expect, test } from "vite-plus/test";

import { isAppFile } from "@/lib/library/appFiles";

describe("app files", () => {
  test("skips the debug log and widget code", () => {
    const widgetFolder = { reservedKind: "widgetDefinition" as const };
    expect(isAppFile({ name: "memora-debug.log", parentId: null }, null)).toBe(true);
    expect(isAppFile({ name: "widget.html", parentId: "w" }, widgetFolder)).toBe(true);
    expect(isAppFile({ name: "widget.json", parentId: "w" }, widgetFolder)).toBe(true);
  });

  test("keeps user files with the same names elsewhere", () => {
    expect(isAppFile({ name: "memora-debug.log", parentId: "f" }, null)).toBe(false);
    expect(isAppFile({ name: "widget.html", parentId: "f" }, { reservedKind: null })).toBe(false);
    expect(
      isAppFile({ name: "todo.md", parentId: "w" }, { reservedKind: "widgetDefinition" }),
    ).toBe(false);
  });
});
