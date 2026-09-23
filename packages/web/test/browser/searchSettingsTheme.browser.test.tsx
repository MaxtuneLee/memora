import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

import SearchPalette from "@/components/search/SearchPalette";
import SettingsAppearanceSection from "@/components/settings/SettingsAppearanceSection";
import { SearchPaletteContextProvider } from "@/hooks/search/useSearchPalette";
import { SettingsDialogContextProvider } from "@/hooks/settings/useSettingsDialog";
import { useDocumentTheme } from "@/hooks/theme/useDocumentTheme";
import { desktopFilesQuery$ } from "@/lib/desktop/queries";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import {
  applyDocumentTheme,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme/documentTheme";
import type { file as LiveStoreFile } from "@/livestore/file";
import { contrast, textContrast } from "./colorContrast";
import {
  DESKTOP_VIEWPORT,
  emulateColorScheme,
  expectScreenshot,
  loadAppFonts,
  NARROW_VIEWPORT,
} from "./visual";

// The query modules pull in LiveStore's wa-sqlite loader, whose .wasm this harness can't serve.
// Nothing here runs LiveStore, so swallow only that rejection.
window.addEventListener("unhandledrejection", (event) => {
  if (String(event.reason).includes("fetching of the wasm failed")) event.preventDefault();
});

const store = vi.hoisted(() => ({
  settings: { theme: "system" } as Record<string, unknown>,
  files: [] as unknown[],
  useQuery: (() => []) as (query: unknown) => unknown,
  commit: () => {},
}));
vi.mock("@/livestore/store", () => ({ useAppStore: () => store }));
vi.mock("@/lib/chat/chatSessionStorage", () => ({ listChatSessions: async () => [] }));
vi.mock("@/lib/model-worker", () => ({ modelWorkerFactory: {} }));

store.useQuery = (query) => {
  if (query === settingsDocumentQuery$) return store.settings;
  if (query === desktopFilesQuery$) return store.files;
  return [];
};

const makeFile = (id: string, name: string, type: LiveStoreFile["type"]): LiveStoreFile =>
  ({
    id,
    name,
    type,
    mimeType: type === "audio" ? "audio/mp4" : "text/markdown",
    sizeBytes: 48_000,
    parentId: null,
    indexSummary: null,
    updatedAt: new Date("2026-09-01T09:00:00Z"),
    createdAt: new Date("2026-09-01T09:00:00Z"),
  }) as unknown as LiveStoreFile;

store.files = [
  makeFile("en", "Quarterly-financial-planning-and-budget-review-meeting-recording.m4a", "audio"),
  makeFile("zh", "第一季度财务规划与预算审查会议记录完整版本备份文件.md", "document"),
  makeFile("short", "Interview notes.md", "document"),
];

const SearchFixture = () => (
  <MemoryRouter>
    <SettingsDialogContextProvider
      value={{
        isSettingsOpen: false,
        activeSection: "general",
        setActiveSection: () => {},
        openSettings: () => {},
        setIsSettingsOpen: () => {},
      }}
    >
      <SearchPaletteContextProvider
        value={{
          isSearchOpen: true,
          openSearch: () => {},
          closeSearch: () => {},
          toggleSearch: () => {},
        }}
      >
        <SearchPalette />
      </SearchPaletteContextProvider>
    </SettingsDialogContextProvider>
  </MemoryRouter>
);

let root: Root | null = null;
let host: HTMLElement | null = null;

const mount = async (node: ReactElement, theme?: ResolvedTheme) => {
  if (theme) applyDocumentTheme(theme);
  // index.css is not loaded here; paint the page from the theme like its body rule does.
  document.body.style.backgroundColor = "var(--color-memora-bg)";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  root.render(node);
  await expect
    .poll(() => (host?.textContent?.length ?? 0) > 0 || !!document.querySelector("dialog[open]"))
    .toBe(true);
  await loadAppFonts();
};

const byText = (text: string): Element => {
  const element = [...document.querySelectorAll("body *")].find(
    (node) => node.childElementCount === 0 && node.textContent === text,
  );
  if (!element) throw new Error(`Missing ${text}`);
  return element;
};

// The NativeDialog panel: two levels above the visually hidden title.
const searchPanel = (): Element => {
  const panel = byText("Search workspace").parentElement?.parentElement;
  if (!panel) throw new Error("Missing search panel");
  return panel;
};

afterEach(async () => {
  root?.unmount();
  host?.remove();
  document.body.removeAttribute("style");
  root = null;
  host = null;
  store.settings = { theme: "system" };
  await page.viewport(DESKTOP_VIEWPORT.width, DESKTOP_VIEWPORT.height);
  await emulateColorScheme("light");
});

describe.each(["light", "dark"] as const)("search in %s", (theme) => {
  it.each([
    ["desktop", DESKTOP_VIEWPORT],
    ["narrow", NARROW_VIEWPORT],
  ] as const)(
    "matches the %s reference with long English and Chinese file names",
    async (size, viewport) => {
      await page.viewport(viewport.width, viewport.height);
      await mount(<SearchFixture />, theme);
      await expect.poll(() => document.body.textContent?.includes("Interview notes.md")).toBe(true);

      const panel = searchPanel();
      const listbox = document.getElementById("global-search-listbox") as Element;
      byText("Interview notes.md").scrollIntoView({ block: "end" });
      expect(listbox.scrollWidth).toBeLessThanOrEqual(listbox.clientWidth + 1);
      expect(panel.getBoundingClientRect().right).toBeLessThanOrEqual(viewport.width);
      expect.soft(textContrast(byText("Interview notes.md"))).toBeGreaterThanOrEqual(4.5);
      await expectScreenshot(panel, `search-${size}-${theme}`);
    },
  );

  it("marks the active result with a surface distinct from the panel", async () => {
    await mount(<SearchFixture />, theme);
    await expect.poll(() => searchPanel().querySelector("[aria-selected='true']")).not.toBeNull();
    const active = searchPanel().querySelector("[aria-selected='true']") as Element;
    const surface = getComputedStyle(active.firstElementChild as Element).backgroundColor;
    expect(surface).not.toBe(getComputedStyle(searchPanel()).backgroundColor);
    expect.soft(textContrast(active.querySelector("p") as Element)).toBeGreaterThanOrEqual(4.5);
  });
});

describe.each(["light", "dark"] as const)("appearance settings in %s", (theme) => {
  it.each([
    ["desktop", DESKTOP_VIEWPORT],
    ["narrow", NARROW_VIEWPORT],
  ] as const)("matches the %s reference", async (size, viewport) => {
    await page.viewport(viewport.width, viewport.height);
    await mount(<SettingsAppearanceSection />, theme);
    const section = host?.querySelector("section");
    if (!section) throw new Error("Missing appearance section");

    expect(section.scrollWidth).toBeLessThanOrEqual(section.clientWidth + 1);
    expect.soft(textContrast(byText("Appearance"))).toBeGreaterThanOrEqual(4.5);
    for (const label of ["Light", "Dark", "System"]) {
      expect.soft(textContrast(byText(label)), label).toBeGreaterThanOrEqual(4.5);
    }
    await expectScreenshot(section, `appearance-${size}-${theme}`);
  });
});

function ThemeController({ preference }: { preference: ThemePreference }) {
  useDocumentTheme(preference);
  return <SettingsAppearanceSection />;
}

// System resolves to the same output as explicit Light or Dark, so these tests check the resolved
// theme under emulation and compare the painted surface to the explicit reference instead of
// taking duplicate screenshots.
describe("System preference under browser color-scheme emulation", () => {
  it.each(["light", "dark"] as const)(
    "follows an emulated %s scheme and repaints live",
    async (scheme) => {
      await emulateColorScheme(scheme);
      store.settings = { theme: "system" };
      await mount(<ThemeController preference="system" />);

      await expect.poll(() => document.documentElement.dataset.theme).toBe(scheme);
      const section = host?.querySelector("section") as Element;
      const systemBackground = getComputedStyle(section).backgroundColor;

      applyDocumentTheme(scheme);
      expect(getComputedStyle(section).backgroundColor).toBe(systemBackground);

      const other = scheme === "dark" ? "light" : "dark";
      await emulateColorScheme(other);
      await expect.poll(() => document.documentElement.dataset.theme).toBe(other);
      expect(contrast(getComputedStyle(section).backgroundColor, systemBackground)).toBeGreaterThan(
        2,
      );
    },
  );

  it.each(["light", "dark"] as const)(
    "keeps explicit %s when the emulated scheme flips",
    async (preference) => {
      await emulateColorScheme(preference === "dark" ? "light" : "dark");
      store.settings = { theme: preference };
      await mount(<ThemeController preference={preference} />);
      await expect.poll(() => document.documentElement.dataset.theme).toBe(preference);

      await emulateColorScheme(preference);
      await emulateColorScheme(preference === "dark" ? "light" : "dark");
      expect(document.documentElement.dataset.theme).toBe(preference);
    },
  );
});
