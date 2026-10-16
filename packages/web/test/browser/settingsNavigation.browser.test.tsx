import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";

import SettingsDialog from "@/components/settings/SettingsDialog";
import type { SettingsSectionId } from "@/types/settings";
import "@/index.css";

// Keep the real dialog and navigation; section data and workers are unrelated to scrolling.
vi.mock("@/components/settings/SettingsAiProviderSection", () => ({ default: () => null }));
vi.mock("@/components/settings/SettingsModelRoutingSection", () => ({ default: () => null }));
vi.mock("@/components/settings/SettingsAboutSection", () => ({
  default: () => <p>About content</p>,
}));
vi.mock("@/components/settings/SettingsAppearanceSection", () => ({ default: () => null }));
vi.mock("@/components/settings/SettingsGeneralSection", () => ({ default: () => null }));
vi.mock("@/components/settings/SettingsMemorySection", () => ({ default: () => null }));
vi.mock("@/components/settings/SettingsPermissionsSection", () => ({ default: () => null }));
vi.mock("@/components/settings/SettingsIndexingSection", () => ({ default: () => null }));
vi.mock("@/components/settings/SettingsLocalModelsSection", () => ({ default: () => null }));
vi.mock("@/components/settings/SettingsSecuritySection", () => ({ default: () => null }));
vi.mock("@/components/settings/SettingsSyncSection", () => ({ default: () => null }));
vi.mock("@/components/settings/SettingsSkillsSection", () => ({ default: () => null }));
vi.mock("@/components/settings/SettingsStorageSection", () => ({ default: () => null }));

let root: Root | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => {
  root?.unmount();
  host?.remove();
});

function Fixture({ initialSection }: { initialSection: SettingsSectionId }) {
  const [section, setSection] = useState(initialSection);
  return (
    <SettingsDialog
      open
      onOpenChange={() => {}}
      activeSection={section}
      onSectionChange={setSection}
    />
  );
}

const mount = async (section: SettingsSectionId) => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  root.render(<Fixture initialSection={section} />);
  await expect.poll(() => document.querySelector("dialog[open]")).not.toBeNull();
};

const scrollContainer = (button: HTMLElement): HTMLElement | null => {
  for (
    let parent = button.parentElement;
    parent && parent.tagName !== "DIALOG";
    parent = parent.parentElement
  ) {
    if (
      ["auto", "scroll"].includes(getComputedStyle(parent).overflowY) &&
      parent.scrollHeight > parent.clientHeight
    )
      return parent;
  }
  return null;
};

test.each([
  { width: 375, height: 640, section: "general" as const },
  { width: 700, height: 360, section: "skills" as const },
  { width: 1000, height: 480, section: "general" as const },
])("reaches the last settings section at $width × $height", async ({ width, height, section }) => {
  await page.viewport(width, height);
  await mount(section);
  if (width < 768) await page.getByRole("button", { name: "Sections", exact: true }).click();
  const buttons = [
    ...document.querySelectorAll<HTMLButtonElement>("nav[aria-label='Settings sections'] button"),
  ];
  const about = buttons.find(
    (button) => button.textContent?.trim() === "About" && button.getClientRects().length > 0,
  );
  if (!about) throw new Error("Missing About navigation button");
  let scroll: HTMLElement | null = null;
  await expect
    .poll(
      () => {
        scroll = scrollContainer(about);
        return scroll !== null;
      },
      { timeout: 1500 },
    )
    .toBe(true);
  if (!scroll) throw new Error("The settings navigation has no scroll container");
  const container = scroll as HTMLElement;
  container.scrollTop = container.scrollHeight;
  await expect
    .poll(
      () => about.getBoundingClientRect().bottom <= container.getBoundingClientRect().bottom + 1,
    )
    .toBe(true);
  expect(container.getBoundingClientRect().bottom).toBeLessThanOrEqual(height);
  await page.getByRole("button", { name: "About", exact: true }).click();
  await expect.element(page.getByText("About content", { exact: true })).toBeVisible();
  if (width < 768)
    await expect
      .element(page.getByRole("button", { name: "Sections", exact: true }))
      .toHaveAttribute("aria-expanded", "false");
});
