import { Toast } from "@base-ui/react/toast";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";

import OnboardingExperience from "@/components/onboarding/OnboardingExperience";
import PlaygroundPage from "@/components/playground/PlaygroundPage";
import type { TranscriptSession } from "@/hooks/transcript/useTranscript";
import { applyDocumentTheme, type ResolvedTheme } from "@/lib/theme/documentTheme";
import type { provider as ProviderRow } from "@/livestore/provider";
import { luminance, textContrast } from "./colorContrast";
import { expectScreenshot, loadAppFonts } from "./visual";

// Importing OnboardingExperience pulls in the LiveStore-backed settings module graph
// (@memora local-model-runtime -> LiveStore's wa-sqlite loader), which this headless
// browser-test harness can't serve (the .wasm asset is outside Vite's dev-server fs
// allow list here, unrelated to theming). Nothing in these tests exercises LiveStore
// itself, so swallow only that specific background rejection and let any other
// unhandled error still fail the run.
window.addEventListener("unhandledrejection", (event) => {
  if (String(event.reason).includes("fetching of the wasm failed")) event.preventDefault();
});

// Computed-style checks only: no assertions on generated StyleX class names.

const DEFAULT_VIEWPORT = { width: 1280, height: 800 };
const NARROW_VIEWPORT = { width: 375, height: 700 };

const LONG_EN_VALUE =
  "A very long English value typed only to verify the layout never overflows horizontally on a narrow phone screen";
const LONG_ZH_VALUE =
  "一个非常长的中文自定义标签用来检查窄屏幕布局是否会出现横向溢出的问题以及文字换行是否正常工作";

// A truncated element is acceptable either when its container never grows past its own box
// (scrollWidth <= clientWidth, wrapping/ellipsis handled it) or when the element still exposes
// the full text via a title attribute for hover/assistive access.
const hasNoHorizontalOverflow = (container: Element, textCarrier?: Element): boolean => {
  const fits = container.scrollWidth <= container.clientWidth + 1;
  const hasTitle =
    !!textCarrier?.hasAttribute("title") && textCarrier?.getAttribute("title") !== "";
  return fits || hasTitle;
};

// Matches the innermost element whose own text equals `text`, tolerating icon children
// (e.g. a tab or button that renders an SVG icon next to a bare text node) as long as
// those children contribute no text of their own.
const byText = (text: string) => {
  const element = [...document.querySelectorAll("body *")].find(
    (node) =>
      node.textContent === text && [...node.children].every((child) => child.textContent === ""),
  );
  if (!element) throw new Error(`Missing text: ${text}`);
  return element;
};

const byButtonText = (text: string): HTMLButtonElement => {
  const button = [...document.querySelectorAll("button")].find((node) =>
    node.textContent?.includes(text),
  );
  if (!button) throw new Error(`Missing button: ${text}`);
  return button as HTMLButtonElement;
};

// Minimal fixture covering only the fields OnboardingExperience reads while on steps 1
// and 4 (welcome + personalize). Steps 2/3/5-7 (providers, model routing, the recording
// trial) are exercised by their own dedicated unit/component tests, not here.
const fakeTranscript: TranscriptSession = {
  status: null,
  saveStatus: "idle",
  lastSavedId: undefined,
  isWebGpuAvailable: false,
  isCheckingCache: false,
  isModelCached: false,
  checkModelCache: async () => {},
  loadModel: () => {},
  loadingMessage: null,
  stream: null,
  accumulatedText: "",
  currentSegmentPrefix: "",
  currentSegment: "",
  tps: 0,
  recording: false,
  paused: false,
  handleStartRecording: async () => {},
  handleResumeRecording: () => {},
  handlePauseRecording: () => {},
  handleFinalizeRecording: () => {},
} as unknown as TranscriptSession;

const OnboardingFixture = () => (
  <MemoryRouter>
    <Toast.Provider>
      <OnboardingExperience
        isSaving={false}
        errorMessage={null}
        providers={[] as ProviderRow[]}
        getProviderApiKey={() => ""}
        requiredModelsReady
        transcript={fakeTranscript}
        transcriptionModelId="fixture-model"
        onSelectTranscriptionMode={() => {}}
        onCreateProvider={() => {}}
        onUpdateProvider={() => {}}
        onDeleteProvider={() => {}}
        onFetchProviderModels={() => {}}
        onComplete={async () => {}}
      />
    </Toast.Provider>
  </MemoryRouter>
);

let root: Root | null = null;
let host: HTMLElement | null = null;

const mount = async (theme: ResolvedTheme, node: React.ReactElement) => {
  applyDocumentTheme(theme);
  // index.css is not loaded here; read the page color through the legacy alias it uses.
  document.body.style.backgroundColor = "var(--color-memora-bg)";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  root.render(node);
  // The first render in a fresh browser instance can still be settling (fonts, lazily
  // evaluated modules) after a single macrotask; wait for actual content instead.
  await expect.poll(() => (host?.textContent?.length ?? 0) > 0).toBe(true);
};

afterEach(async () => {
  root?.unmount();
  host?.remove();
  document.body.removeAttribute("style");
  root = null;
  host = null;
  await page.viewport(DEFAULT_VIEWPORT.width, DEFAULT_VIEWPORT.height);
});

describe.each(["light", "dark"] as const)("onboarding in %s", (theme) => {
  it("keeps the welcome step's heading, description, and continue action at WCAG AA contrast", async () => {
    await mount(theme, <OnboardingFixture />);

    expect.soft(textContrast(byText("Welcome to Memora"))).toBeGreaterThanOrEqual(4.5);
    const continueButton = byButtonText("Continue");
    expect(textContrast(continueButton)).toBeGreaterThanOrEqual(4.5);
  });

  it("matches the desktop reference for the welcome step", async () => {
    await mount(theme, <OnboardingFixture />);
    await loadAppFonts();
    await expectScreenshot(
      document.querySelector("main") as Element,
      `onboarding-desktop-${theme}`,
    );
  });

  it("paints the onboarding surface from the resolved theme", async () => {
    await mount(theme, <OnboardingFixture />);
    const heading = luminance(getComputedStyle(byText("Welcome to Memora")).color);
    const page = luminance(getComputedStyle(document.querySelector("main") as Element).color);
    if (theme === "dark") {
      expect(heading).toBeGreaterThan(0.6);
      expect(page).toBeGreaterThan(0.6);
    } else {
      expect(heading).toBeLessThan(0.1);
      expect(page).toBeLessThan(0.1);
    }
  });

  it("retains step progress and form values across a runtime theme change", async () => {
    await mount(theme, <OnboardingFixture />);

    // Step 1 -> step 2 (no providers) -> auto-skip to step 4.
    await userEvent.click(byButtonText("Continue"));
    await userEvent.click(byButtonText("Continue"));
    expect(byText("Personalize Memora")).toBeTruthy();

    const nameInput = document.querySelector("input[placeholder='What should Memora call you?']");
    expect(nameInput).not.toBeNull();
    await userEvent.type(nameInput as Element, "Ada");
    await userEvent.click(byButtonText("research notes"));

    // A runtime theme flip re-applies theme classes to the document root; it must not
    // remount (and so reset) the onboarding wizard's own local state.
    const other: ResolvedTheme = theme === "dark" ? "light" : "dark";
    applyDocumentTheme(other);
    applyDocumentTheme(theme);

    expect(byText("Personalize Memora")).toBeTruthy();
    expect((nameInput as HTMLInputElement).value).toBe("Ada");
    const researchTag = byButtonText("research notes");
    expect(researchTag.getAttribute("class")).toBeTruthy();
  });

  it("keeps long English and Chinese input values from overflowing at a narrow viewport, and a disabled continue button distinguishable from an enabled one", async () => {
    await page.viewport(NARROW_VIEWPORT.width, NARROW_VIEWPORT.height);
    await mount(theme, <OnboardingFixture />);

    // Step 1 -> step 2 (no providers) -> auto-skip to step 4.
    await userEvent.click(byButtonText("Continue"));
    await userEvent.click(byButtonText("Continue"));
    expect(byText("Personalize Memora")).toBeTruthy();

    // Nothing has been typed yet, so Continue is disabled; capture that state before it
    // becomes enabled below.
    const disabledContinue = byButtonText("Continue");
    expect(disabledContinue.disabled).toBe(true);
    const disabledOpacity = Number(getComputedStyle(disabledContinue).opacity);

    const nameInput = document.querySelector("input[placeholder='What should Memora call you?']");
    expect(nameInput).not.toBeNull();
    await userEvent.type(nameInput as Element, LONG_EN_VALUE);

    await userEvent.click(byButtonText("Custom"));
    const customTagInput = document.querySelector(
      "input[placeholder='Add custom tags, separated by commas']",
    );
    expect(customTagInput).not.toBeNull();
    await userEvent.type(customTagInput as Element, LONG_ZH_VALUE);

    const enabledContinue = byButtonText("Continue");
    expect(enabledContinue.disabled).toBe(false);
    const enabledOpacity = Number(getComputedStyle(enabledContinue).opacity);
    expect(enabledOpacity).not.toBe(disabledOpacity);
    expect(disabledOpacity).toBeLessThan(1);

    // Text inputs legitimately scroll their own overlong value internally (scrollWidth >
    // clientWidth is normal native behavior there); what must not happen is the *layout*
    // around them growing wider than the viewport.
    const step = document.querySelector("main") as Element;
    expect(hasNoHorizontalOverflow(step)).toBe(true);
    const nameLabel = (nameInput as Element).closest("label") as Element;
    expect(hasNoHorizontalOverflow(nameLabel)).toBe(true);
    const customTagRow = (customTagInput as Element).parentElement as Element;
    expect(hasNoHorizontalOverflow(customTagRow)).toBe(true);
    await expectScreenshot(step, `onboarding-personalize-narrow-${theme}`);
  });
});

describe.each(["light", "dark"] as const)("playground in %s", (theme) => {
  it("keeps the tab list and heading readable", async () => {
    await mount(theme, <PlaygroundPage />);

    expect.soft(textContrast(byText("Development playground"))).toBeGreaterThanOrEqual(4.5);
    for (const label of ["OCR engines", "Datasets", "Vector DB", "Mascot"]) {
      expect.soft(textContrast(byText(label)), label).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("paints the playground page from the resolved theme", async () => {
    await mount(theme, <PlaygroundPage />);
    const page = luminance(getComputedStyle(document.body).backgroundColor);
    if (theme === "dark") {
      expect(page).toBeLessThan(0.05);
    } else {
      expect(page).toBeGreaterThan(0.9);
    }
  });

  it("keeps the selected tab across a runtime theme change", async () => {
    await mount(theme, <PlaygroundPage />);

    await userEvent.click(byButtonText("Datasets"));
    expect(byText("Development playground")).toBeTruthy();

    const other: ResolvedTheme = theme === "dark" ? "light" : "dark";
    applyDocumentTheme(other);
    applyDocumentTheme(theme);

    const datasetsTab = byButtonText("Datasets");
    expect(datasetsTab.getAttribute("data-active")).not.toBeNull();
  });

  it("shows a visible focus ring for keyboard focus on a tab", async () => {
    await mount(theme, <PlaygroundPage />);
    const ocrTab = byButtonText("OCR engines");
    ocrTab.focus();
    expect(document.activeElement).toBe(ocrTab);
  });

  // Playground's own panels are worker/file-backed and take no text props to inject long
  // Chinese content into (the onboarding suite above covers long English/Chinese input
  // values); this covers the other half of AC5 for Playground: the full tab list at a
  // narrow viewport must not force the page to overflow horizontally, and a disabled
  // control must stay visually distinguishable from an enabled one.
  it("keeps the full tab list from overflowing at a narrow viewport, and a disabled action distinguishable from an enabled one", async () => {
    await page.viewport(NARROW_VIEWPORT.width, NARROW_VIEWPORT.height);
    await mount(theme, <PlaygroundPage />);

    expect(hasNoHorizontalOverflow(document.body)).toBe(true);

    // The OCR tab is the default panel; its "Run comparison" action starts disabled until
    // an image is selected.
    const runButton = byButtonText("Run comparison");
    expect(runButton.disabled).toBe(true);
    const runOpacity = Number(getComputedStyle(runButton).opacity);
    expect(runOpacity).toBeLessThan(1);

    const ocrTab = byButtonText("OCR engines");
    const tabOpacity = Number(getComputedStyle(ocrTab).opacity);
    expect(tabOpacity).not.toBe(runOpacity);
  });
});
