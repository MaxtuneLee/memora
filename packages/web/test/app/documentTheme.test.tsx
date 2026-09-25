// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import SettingsAppearanceSection from "@/components/settings/SettingsAppearanceSection";
import { useDocumentTheme } from "@/hooks/theme/useDocumentTheme";
import {
  resolveTheme,
  THEME_COLORS,
  THEME_MIRROR_KEY,
  type ThemePreference,
} from "@/lib/theme/documentTheme";
import type { setting } from "@/livestore/setting";

const store = vi.hoisted(() => ({
  settings: {} as Partial<setting>,
  useQuery: vi.fn(),
  commit: vi.fn(),
}));
vi.mock("@/livestore/store", () => ({ useAppStore: () => store }));

const media = {
  matches: false,
  listeners: new Set<() => void>(),
  addEventListener: vi.fn((_type: string, listener: () => void) => media.listeners.add(listener)),
  removeEventListener: vi.fn((_type: string, listener: () => void) =>
    media.listeners.delete(listener),
  ),
};

const setSystemDark = (dark: boolean) => {
  media.matches = dark;
  act(() => media.listeners.forEach((listener) => listener()));
};

const root = document.documentElement;

beforeEach(() => {
  vi.clearAllMocks();
  media.matches = false;
  media.listeners.clear();
  window.matchMedia = vi.fn(() => media) as unknown as typeof window.matchMedia;
  localStorage.clear();
  root.className = "";
  root.removeAttribute("data-theme");
  root.style.colorScheme = "";
  document.head.innerHTML = '<meta name="theme-color" content="#000000" />';
  store.settings = { theme: "system" };
  store.useQuery.mockImplementation(() => store.settings);
});
afterEach(cleanup);

const themeColor = () =>
  document.querySelector('meta[name="theme-color"]')?.getAttribute("content");

describe("theme resolution", () => {
  test.each([
    ["light", false, "light"],
    ["light", true, "light"],
    ["dark", false, "dark"],
    ["dark", true, "dark"],
    ["system", false, "light"],
    ["system", true, "dark"],
  ] as const)("%s with system dark %s resolves to %s", (preference, systemDark, expected) => {
    expect(resolveTheme(preference, systemDark)).toBe(expected);
  });
});

describe("document root theme", () => {
  test("System follows operating system changes at runtime", () => {
    const { result } = renderHook(() => useDocumentTheme("system"));
    expect(result.current).toBe("light");

    setSystemDark(true);
    expect(result.current).toBe("dark");
    expect(root.dataset.theme).toBe("dark");
  });

  test.each(["light", "dark"] as const)(
    "explicit %s ignores operating system changes and does not subscribe",
    (preference) => {
      const { result } = renderHook(() => useDocumentTheme(preference));
      setSystemDark(!media.matches);
      expect(result.current).toBe(preference);
      expect(media.addEventListener).not.toHaveBeenCalled();
    },
  );

  test("removes the media listener when leaving System or unmounting", () => {
    const { rerender, unmount } = renderHook(
      ({ preference }: { preference: ThemePreference }) => useDocumentTheme(preference),
      { initialProps: { preference: "system" } },
    );
    expect(media.listeners.size).toBe(1);

    rerender({ preference: "dark" });
    expect(media.listeners.size).toBe(0);

    rerender({ preference: "system" });
    unmount();
    expect(media.listeners.size).toBe(0);
    expect(media.removeEventListener).toHaveBeenCalledTimes(2);
  });

  test("keeps the StyleX theme, data-theme, color-scheme, and theme-color together", () => {
    const { rerender } = renderHook(
      ({ preference }: { preference: ThemePreference }) => useDocumentTheme(preference),
      { initialProps: { preference: "light" } },
    );
    const lightClasses = root.className;
    expect(lightClasses).not.toBe("");
    expect(root.dataset.theme).toBe("light");
    expect(root.style.colorScheme).toBe("light");
    expect(themeColor()).toBe(THEME_COLORS.light);

    rerender({ preference: "dark" });
    expect(root.className).not.toBe(lightClasses);
    expect(root.dataset.theme).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
    expect(themeColor()).toBe(THEME_COLORS.dark);

    rerender({ preference: "light" });
    expect(root.className).toBe(lightClasses);
  });

  test("the stored setting corrects a stale first-frame mirror", () => {
    localStorage.setItem(THEME_MIRROR_KEY, "dark");
    root.dataset.theme = "dark";

    renderHook(() => useDocumentTheme("light"));

    expect(root.dataset.theme).toBe("light");
    expect(localStorage.getItem(THEME_MIRROR_KEY)).toBe("light");
  });
});

describe("first frame", () => {
  const html = readFileSync(resolve(__dirname, "../../index.html"), "utf8");
  const script = html.match(/<script id="theme-bootstrap">([\s\S]*?)<\/script>/)?.[1] ?? "";

  const runBootstrap = (stored: string | null, systemDark: boolean) => {
    if (stored) localStorage.setItem(THEME_MIRROR_KEY, stored);
    media.matches = systemDark;
    // Runs the exact script shipped in index.html.
    // oxlint-disable-next-line no-implied-eval
    new Function(script)();
    return { theme: root.dataset.theme, colorScheme: root.style.colorScheme, color: themeColor() };
  };

  test.each([
    ["light", true, "light"],
    ["dark", false, "dark"],
    ["system", true, "dark"],
    [null, true, "dark"],
    [null, false, "light"],
  ] as const)("stored %s with system dark %s starts %s", (stored, systemDark, expected) => {
    expect(runBootstrap(stored, systemDark)).toEqual({
      theme: expected,
      colorScheme: expected,
      color: THEME_COLORS[expected],
    });
  });
});

describe("appearance settings", () => {
  test("persists the selected theme through the settings event", () => {
    render(<SettingsAppearanceSection />);
    expect(screen.getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Dark" }));

    expect(store.commit).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        name: "settingsSet",
        args: expect.objectContaining({ value: { theme: "dark" } }),
      }),
    );
  });
});
