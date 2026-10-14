import { describe, expect, test } from "vite-plus/test";

import { isExcludedFromContentIndex } from "@/lib/content/contentTaskHandlers";

describe("content index exclusions", () => {
  test("skips the debug log and widget code", () => {
    const widgetFolder = { reservedKind: "widgetDefinition" as const };
    expect(isExcludedFromContentIndex({ name: "memora-debug.log", parentId: null }, null)).toBe(
      true,
    );
    expect(isExcludedFromContentIndex({ name: "widget.html", parentId: "w" }, widgetFolder)).toBe(
      true,
    );
    expect(isExcludedFromContentIndex({ name: "widget.json", parentId: "w" }, widgetFolder)).toBe(
      true,
    );
  });

  test("keeps user files with the same names elsewhere", () => {
    expect(isExcludedFromContentIndex({ name: "memora-debug.log", parentId: "f" }, null)).toBe(
      false,
    );
    expect(
      isExcludedFromContentIndex({ name: "widget.html", parentId: "f" }, { reservedKind: null }),
    ).toBe(false);
    expect(
      isExcludedFromContentIndex(
        { name: "todo.md", parentId: "w" },
        { reservedKind: "widgetDefinition" },
      ),
    ).toBe(false);
  });
});
