import { expect, test } from "vite-plus/test";

import { isMobileDevice } from "@/lib/device/isMobileDevice";

const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

test("flags phones and tablets, including iPadOS posing as a Mac", () => {
  expect(
    isMobileDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148", 5),
  ).toBe(true);
  expect(isMobileDevice("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36", 5)).toBe(
    true,
  );
  expect(isMobileDevice("Mozilla/5.0 (Linux; Android 14; SM-X710) Safari/537.36", 10)).toBe(true);
  expect(isMobileDevice(MAC, 5)).toBe(true);
});

test("lets desktops through", () => {
  expect(isMobileDevice(MAC, 0)).toBe(false);
  expect(isMobileDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0", 10)).toBe(false);
});
