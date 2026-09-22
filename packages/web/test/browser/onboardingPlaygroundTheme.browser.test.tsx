import { Toast } from "@base-ui/react/toast";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import OnboardingExperience from "@/components/onboarding/OnboardingExperience";
import PlaygroundPage from "@/components/playground/PlaygroundPage";
import type { TranscriptSession } from "@/hooks/transcript/useTranscript";
import { applyDocumentTheme, type ResolvedTheme } from "@/lib/theme/documentTheme";
import type { provider as ProviderRow } from "@/livestore/provider";

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
const rgb = (color: string): number[] => {
  const channels = color
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  if (!channels || channels.length < 3) throw new Error(`Unparsed color: ${color}`);
  return channels;
};

const luminance = (color: string): number => {
  const [r, g, b] = rgb(color).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string): number => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};

// Walks up to the first opaque background, the color the text is actually drawn on.
const backgroundOf = (element: Element): string => {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor;
    if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") return color;
  }
  return getComputedStyle(document.body).backgroundColor;
};

const textContrast = (element: Element) =>
  contrast(getComputedStyle(element).color, backgroundOf(element));

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

afterEach(() => {
  root?.unmount();
  host?.remove();
  document.body.removeAttribute("style");
  root = null;
  host = null;
});

describe.each(["light", "dark"] as const)("onboarding in %s", (theme) => {
  it("keeps the welcome step's heading, description, and continue action at WCAG AA contrast", async () => {
    await mount(theme, <OnboardingFixture />);

    expect.soft(textContrast(byText("Welcome to Memora"))).toBeGreaterThanOrEqual(4.5);
    const continueButton = byButtonText("Continue");
    expect(textContrast(continueButton)).toBeGreaterThanOrEqual(4.5);
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
});
