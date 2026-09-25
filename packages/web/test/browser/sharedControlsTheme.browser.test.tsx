import { Toast } from "@base-ui/react/toast";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import ToastStack from "@/components/ToastStack";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { TabSelect } from "@/components/ui/TabSelect";
import { resolveThemeColors } from "@/hooks/theme/useThemeColorVars";
import { applyDocumentTheme, type ResolvedTheme } from "@/lib/theme/documentTheme";
import { tokens } from "@/styles/stylex.stylex";
import { luminance, contrast, backgroundOf, textContrast } from "./colorContrast";

// Computed-style checks only: no assertions on generated StyleX class names.

const ShowToast = () => {
  const { add } = Toast.useToastManager();
  useEffect(() => {
    add({ title: "Saved", description: "Your changes are stored.", type: "success", timeout: 0 });
  }, [add]);
  return null;
};

const Fixture = () => (
  <Toast.Provider>
    <Button variant="primary">Primary</Button>
    <Button variant="secondary">Secondary</Button>
    <Button variant="secondary" disabled>
      Disabled
    </Button>
    <Button variant="secondary" aria-busy>
      Loading
    </Button>
    <Button variant="oliveGhost">Olive</Button>
    <Button variant="destructive">Delete</Button>
    <Input aria-label="Name" placeholder="Name" />
    <Input aria-label="Invalid" aria-invalid />
    <Switch aria-label="Toggle" defaultChecked />
    <Badge variant="neutral">Neutral</Badge>
    <Badge variant="olive">Olive badge</Badge>
    <Badge variant="warning">Warning badge</Badge>
    <TabSelect
      aria-label="View"
      value="a"
      onValueChange={() => {}}
      options={[
        { value: "a", label: "First" },
        { value: "b", label: "Second" },
      ]}
    />
    {createPortal(<Button variant="secondary">Portal</Button>, document.body)}
    <ShowToast />
    <ToastStack />
  </Toast.Provider>
);

let root: Root | null = null;
let host: HTMLElement | null = null;

const mount = async (theme: ResolvedTheme) => {
  applyDocumentTheme(theme);
  // index.css is not loaded here; read the page color through the legacy alias it uses.
  document.body.style.backgroundColor = "var(--color-memora-bg)";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  root.render(<Fixture />);
  await expect.poll(() => document.body.textContent?.includes("Saved")).toBe(true);
};

const byText = (text: string) => {
  const element = [...document.querySelectorAll("body *")].find(
    (node) => node.childElementCount === 0 && node.textContent === text,
  );
  if (!element) throw new Error(`Missing ${text}`);
  return element;
};

afterEach(() => {
  root?.unmount();
  host?.remove();
  document.body.removeAttribute("style");
  root = null;
  host = null;
});

describe.each(["light", "dark"] as const)("shared controls in %s", (theme) => {
  it("keeps text and interactive text at WCAG AA contrast", async () => {
    await mount(theme);

    for (const label of [
      "Primary",
      "Secondary",
      "Olive",
      "Delete",
      "Neutral",
      "Olive badge",
      "Warning badge",
      "First",
      "Second",
      "Saved",
      "Your changes are stored.",
    ]) {
      expect.soft(textContrast(byText(label)), label).toBeGreaterThanOrEqual(4.5);
    }
    const input = document.querySelector("input[aria-label='Name']");
    expect(input).not.toBeNull();
    expect(textContrast(input as Element)).toBeGreaterThanOrEqual(4.5);
  });

  it("paints surfaces from the resolved theme, including portals", async () => {
    await mount(theme);
    const pageLuminance = luminance(getComputedStyle(document.body).backgroundColor);
    const portal = byText("Portal");
    // The portal renders outside the React host, directly in body.
    expect(portal.parentElement).toBe(document.body);
    expect(getComputedStyle(portal).backgroundColor).toBe(backgroundOf(byText("Secondary")));

    const surface = luminance(getComputedStyle(portal).backgroundColor);
    const text = luminance(getComputedStyle(portal).color);
    if (theme === "dark") {
      expect(pageLuminance).toBeLessThan(0.05);
      expect(surface).toBeLessThan(0.05);
      expect(text).toBeGreaterThan(0.6);
    } else {
      expect(pageLuminance).toBeGreaterThan(0.9);
      expect(surface).toBeGreaterThan(0.9);
      expect(text).toBeLessThan(0.05);
    }
  });

  it("keeps disabled, loading, and error states distinguishable", async () => {
    await mount(theme);
    expect(Number(getComputedStyle(byText("Disabled")).opacity)).toBeLessThan(1);
    expect(Number(getComputedStyle(byText("Loading")).opacity)).toBeLessThan(1);
    expect(getComputedStyle(byText("Loading")).cursor).toBe("progress");

    const normal = getComputedStyle(document.querySelector("input[aria-label='Name']") as Element);
    const invalid = getComputedStyle(
      document.querySelector("input[aria-label='Invalid']") as Element,
    );
    expect(invalid.borderColor).not.toBe(normal.borderColor);
  });

  it("shows a visible focus ring for keyboard focus", async () => {
    await mount(theme);
    const primary = byText("Primary") as HTMLElement;
    await userEvent.tab();
    expect(document.activeElement).toBe(primary);
    const shadow = getComputedStyle(primary).boxShadow;
    expect(shadow).not.toBe("none");
    // The outer ring is the focus color; it must stand out from the page at 3:1.
    const ring = shadow.match(/rgba?\([^)]+\)/g)?.at(-1) ?? "";
    expect(contrast(ring, getComputedStyle(document.body).backgroundColor)).toBeGreaterThanOrEqual(
      3,
    );
  });
});

// Semantic pairs every component relies on, checked on the resolved tokens so a retuned value
// cannot silently drop below target. Text and status text need 4.5:1; focus rings are non-text
// indicators and need 3:1 against the surfaces they sit on. textSoft and the disabled control text
// are for placeholders, metadata, and disabled states, and are not listed.
const TEXT_PAIRS = [
  ...(["text", "textStrong", "textMuted"] as const).flatMap((ink) =>
    (["background", "surface", "surfaceSoft", "surfaceMuted", "card"] as const).map(
      (surface) => [ink, surface] as const,
    ),
  ),
  ["oliveText", "background"],
  ["oliveText", "surface"],
  ["oliveText", "selected"],
  ["primaryText", "primaryBackground"],
  ["selectionText", "selectionBackground"],
  ["warningText", "warningSurface"],
  ["dangerText", "dangerSurface"],
  ["successText", "successSurface"],
  ["infoText", "infoSurface"],
  ["actionText", "recordBackground"],
  ["actionText", "recordBackgroundHover"],
  ["actionText", "confirmBackground"],
  ["actionText", "confirmBackgroundHover"],
] as const;

const FOCUS_PAIRS = [
  ["focusRing", "background"],
  ["focusRing", "surface"],
  ["focusRing", "card"],
] as const;

describe.each(["light", "dark"] as const)("semantic token contrast in %s", (theme) => {
  it("keeps text, status, and action text at 4.5:1 and focus rings at 3:1", () => {
    applyDocumentTheme(theme);
    const names = [...new Set([...TEXT_PAIRS, ...FOCUS_PAIRS].flat())];
    // Each token is a var(--name) string at runtime.
    const colors = resolveThemeColors(
      Object.fromEntries(names.map((name) => [name, String(tokens[name])])),
    );
    for (const [ink, surface] of TEXT_PAIRS) {
      expect
        .soft(contrast(colors[ink], colors[surface]), `${ink} on ${surface}`)
        .toBeGreaterThanOrEqual(4.5);
    }
    for (const [ring, surface] of FOCUS_PAIRS) {
      expect
        .soft(contrast(colors[ring], colors[surface]), `${ring} on ${surface}`)
        .toBeGreaterThanOrEqual(3);
    }
  });
});
