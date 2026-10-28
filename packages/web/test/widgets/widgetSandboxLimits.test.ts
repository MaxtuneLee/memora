import { describe, expect, it } from "vite-plus/test";

import {
  MAX_WIDGET_HEIGHT,
  clampWidgetHeight,
  createActionLimiters,
  createTokenBucket,
  normalizeWidgetLink,
} from "@/lib/widgets/sandbox/limits";

describe("clampWidgetHeight", () => {
  it("keeps sane heights and rounds them", () => {
    expect(clampWidgetHeight(240.4)).toBe(240);
  });

  it("caps a height far beyond any real widget", () => {
    expect(clampWidgetHeight(1e9)).toBe(MAX_WIDGET_HEIGHT);
    expect(clampWidgetHeight(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("never returns less than one pixel", () => {
    expect(clampWidgetHeight(0)).toBe(1);
    expect(clampWidgetHeight(-50)).toBe(1);
    expect(clampWidgetHeight(Number.NaN)).toBe(1);
  });
});

describe("normalizeWidgetLink", () => {
  it("allows http and https links", () => {
    expect(normalizeWidgetLink(" https://example.com/report ")).toBe("https://example.com/report");
    expect(normalizeWidgetLink("http://example.com")).toBe("http://example.com/");
  });

  it("drops script, data, file and malformed links", () => {
    expect(normalizeWidgetLink("javascript:alert(1)")).toBeNull();
    expect(normalizeWidgetLink("data:text/html,<script>1</script>")).toBeNull();
    expect(normalizeWidgetLink("file:///etc/passwd")).toBeNull();
    expect(normalizeWidgetLink("not a url")).toBeNull();
    expect(normalizeWidgetLink("")).toBeNull();
    expect(normalizeWidgetLink(`https://example.com/${"a".repeat(3000)}`)).toBeNull();
  });
});

describe("createTokenBucket", () => {
  it("allows a burst, then refuses until tokens refill", () => {
    let now = 0;
    const bucket = createTokenBucket({ capacity: 2, refillPerSecond: 1, now: () => now });
    expect([bucket.take(), bucket.take(), bucket.take()]).toEqual([true, true, false]);
    now = 1000;
    expect(bucket.take()).toBe(true);
    expect(bucket.take()).toBe(false);
  });

  it("never holds more than its capacity", () => {
    let now = 0;
    const bucket = createTokenBucket({ capacity: 2, refillPerSecond: 1, now: () => now });
    now = 60_000;
    expect([bucket.take(), bucket.take(), bucket.take()]).toEqual([true, true, false]);
  });
});

describe("createActionLimiters", () => {
  it("lets a widget send a few prompts but not a stream of them", () => {
    const limiters = createActionLimiters(() => 0);
    const results = Array.from({ length: 10 }, () => limiters.sendPrompt.take());
    expect(results.filter(Boolean)).toHaveLength(3);
  });
});
