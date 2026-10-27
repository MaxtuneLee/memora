// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  hashWidgetCode,
  readCachedHeight,
  writeCachedHeight,
} from "@/lib/widgets/sandbox/heightCache";

beforeEach(() => {
  window.localStorage.clear();
});

describe("height cache", () => {
  it("remembers the last height written for a key", () => {
    writeCachedHeight("home:a", 240.4);
    writeCachedHeight("home:a", 300);

    expect(readCachedHeight("home:a")).toBe(300);
    expect(readCachedHeight("home:b")).toBeNull();
  });

  it("ignores missing keys and heights that are not worth reserving", () => {
    writeCachedHeight(undefined, 200);
    writeCachedHeight("a", 1);
    writeCachedHeight("a", Number.NaN);

    expect(readCachedHeight(undefined)).toBeNull();
    expect(readCachedHeight("a")).toBeNull();
  });

  it("keeps only the most recent entries", () => {
    for (let index = 0; index < 120; index += 1) {
      writeCachedHeight(`k${index}`, 100 + index);
    }

    expect(readCachedHeight("k0")).toBeNull();
    expect(readCachedHeight("k119")).toBe(219);
    expect(
      Object.keys(JSON.parse(window.localStorage.getItem("memora:widget-heights") ?? "{}")),
    ).toHaveLength(100);
  });

  it("survives unreadable storage", () => {
    window.localStorage.setItem("memora:widget-heights", "not json");

    expect(readCachedHeight("a")).toBeNull();
    writeCachedHeight("a", 200);
    expect(readCachedHeight("a")).toBe(200);
  });
});

describe("hashWidgetCode", () => {
  it("is stable and tells different code apart", () => {
    expect(hashWidgetCode("<div>a</div>")).toBe(hashWidgetCode("<div>a</div>"));
    expect(hashWidgetCode("<div>a</div>")).not.toBe(hashWidgetCode("<div>b</div>"));
  });
});
