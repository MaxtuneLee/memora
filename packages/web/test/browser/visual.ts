import { expect } from "vitest";
import { commands, page } from "vitest/browser";

// The global reset, scrollbar, and first-frame styles, so references match the app. Its web fonts
// load from Google Fonts, so taking or checking references needs the network.
import "@/index.css";

declare module "vitest/browser" {
  interface BrowserCommands {
    emulateMedia: (media: {
      colorScheme?: "light" | "dark";
      reducedMotion?: "reduce" | "no-preference";
    }) => Promise<void>;
  }
}

export const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
export const NARROW_VIEWPORT = { width: 375, height: 700 };

export const emulateColorScheme = (scheme: "light" | "dark"): Promise<void> =>
  commands.emulateMedia({ colorScheme: scheme });

// Mount decorative animations (ripples, pulses) in their reduced-motion resting state.
export const emulateReducedMotion = (reduce: boolean): Promise<void> =>
  commands.emulateMedia({ reducedMotion: reduce ? "reduce" : "no-preference" });

// One reference per surface, resolved theme, and viewport. System preferences resolve to one of
// these outputs, so System tests assert the resolved theme instead of taking another screenshot.
const APP_FONTS = ['400 1em "Noto Sans"', '600 1em "Noto Sans"', '600 1em "IBM Plex Serif"'];

// fonts.ready resolves at once while the imported font stylesheet is still loading, so wait for
// its faces to register and then load the ones the app renders with.
export const loadAppFonts = async (): Promise<void> => {
  await expect
    .poll(() => [...document.fonts].some((face) => face.family.includes("Noto Sans")), {
      timeout: 10_000,
    })
    .toBe(true);
  await Promise.all(APP_FONTS.map((font) => document.fonts.load(font, "Aa会")));
  await document.fonts.ready;
};

export const expectScreenshot = async (element: Element, name: string): Promise<void> => {
  await loadAppFonts();
  // A blinking caret would make the capture flaky.
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  // A test id gives the locator a unique selector even for a bare container div.
  element.setAttribute("data-testid", `visual-${name}`);
  await expect(page.getByTestId(`visual-${name}`)).toMatchScreenshot(name);
};
