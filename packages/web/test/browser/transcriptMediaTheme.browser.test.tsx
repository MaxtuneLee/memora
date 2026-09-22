import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { TranscriptionControls } from "@/components/transcript/TranscriptionControls";
import { TranscriptWords } from "@/components/library/TranscriptWords";
import { WaveformCanvas } from "@/components/library/waveform/WaveformCanvas";
import { applyDocumentTheme, type ResolvedTheme } from "@/lib/theme/documentTheme";

// Computed-style checks only, matching the sharedControlsTheme pattern: no assertions on
// generated StyleX class names or exact hex values (those may be re-tuned independently).
const luminance = (color: string): number => {
  const channels = color
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  if (!channels || channels.length < 3) throw new Error(`Unparsed color: ${color}`);
  const [r, g, b] = channels.map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// The future word reuses the active word's hue faded toward transparent (color-mix), so it is
// the alpha channel -- not the RGB -- that distinguishes it. rgb(...) has no 4th value (opaque).
const alphaOf = (color: string): number => Number(color.match(/[\d.]+/g)?.[3] ?? 1);

let root: Root | null = null;
let host: HTMLElement | null = null;

const mount = (theme: ResolvedTheme, element: React.ReactElement) => {
  applyDocumentTheme(theme);
  host = document.createElement("div");
  host.style.width = "300px";
  document.body.append(host);
  root = createRoot(host);
  root.render(element);
};

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

afterEach(() => {
  root?.unmount();
  host?.remove();
  root = null;
  host = null;
});

describe.each(["light", "dark"] as const)("transcript and media theming in %s", (theme) => {
  it("draws the waveform canvas from the resolved theme and redraws in place on a theme change", async () => {
    // progress=1 avoids the smoothing animation, so the very first frame already paints every
    // bar with the "played" color -- no need to wait out the easing curve.
    mount(theme, <WaveformCanvas peaks={[1, 1, 1, 1, 1, 1, 1, 1]} progress={1} height={40} />);
    await nextFrame();
    await nextFrame();

    const canvas = host!.querySelector("canvas");
    expect(canvas).not.toBeNull();
    const beforeSnapshot = canvas!.toDataURL();
    const canvasNode = canvas;

    const otherTheme: ResolvedTheme = theme === "dark" ? "light" : "dark";
    applyDocumentTheme(otherTheme);
    await nextFrame();
    await nextFrame();

    // Same canvas element (no remount -- playback/seek state on a real player would survive
    // this too), but its pixels changed to match the new theme's colors.
    expect(host!.querySelector("canvas")).toBe(canvasNode);
    expect(canvas!.toDataURL()).not.toBe(beforeSnapshot);

    applyDocumentTheme(theme);
  });

  it("keeps audio recording controls and transcript word states readable", async () => {
    mount(
      theme,
      <TranscriptionControls
        controlMode="recording"
        dockedRight={false}
        showSecondaryControl={false}
        paused={false}
        onStart={() => {}}
        onPause={() => {}}
        onResume={() => {}}
        onFinalize={() => {}}
        isReady
      />,
    );
    await nextFrame();
    const pauseButton = [...host!.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Pause"),
    );
    expect(pauseButton).toBeTruthy();
    const surfaceLuminance = luminance(getComputedStyle(pauseButton!).backgroundColor);
    if (theme === "dark") {
      expect(surfaceLuminance).toBeLessThan(0.3);
    } else {
      expect(surfaceLuminance).toBeGreaterThan(0.7);
    }
    root?.unmount();
    host?.remove();

    mount(
      theme,
      <TranscriptWords
        words={[
          { text: "hello", timestamp: [0, 1] },
          { text: "world", timestamp: [1, 2] },
        ]}
        currentTime={0.5}
        onSeek={() => {}}
      />,
    );
    await nextFrame();
    const activeWord = [...host!.querySelectorAll("span")].find(
      (span) => span.textContent === "hello",
    )!;
    const futureWord = [...host!.querySelectorAll("span")].find(
      (span) => span.textContent === "world",
    )!;
    const activeLuminance = luminance(getComputedStyle(activeWord).color);
    if (theme === "dark") {
      expect(activeLuminance).toBeGreaterThan(0.6);
    } else {
      expect(activeLuminance).toBeLessThan(0.3);
    }
    // The upcoming word fades the same ink toward transparent in both themes.
    expect(alphaOf(getComputedStyle(activeWord).color)).toBeCloseTo(1, 1);
    expect(alphaOf(getComputedStyle(futureWord).color)).toBeLessThan(0.6);
  });
});
