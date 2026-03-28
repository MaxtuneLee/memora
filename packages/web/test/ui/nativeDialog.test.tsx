import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vite-plus/test";

test("native dialog wrapper renders a real dialog element with panel and state hooks", async () => {
  const { NativeDialog } = await import("../../src/components/ui/NativeDialog");

  const html = renderToStaticMarkup(
    <NativeDialog open={true} onOpenChange={() => {}}>
      <div>Dialog body</div>
    </NativeDialog>,
  );

  expect(html).toContain("<dialog");
  expect(html).toContain('data-state="open"');
  expect(html).toContain("Dialog body");
});

test("native dialog wrapper source uses showModal, close, and cancel-event control", () => {
  const source = readFileSync(
    new URL("../../src/components/ui/NativeDialog.tsx", import.meta.url),
    "utf8",
  );

  expect(source).toContain("showModal()");
  expect(source).toContain(".close()");
  expect(source).toContain('"cancel"');
  expect(source).toContain('"close"');
  expect(source).toContain("closeOnBackdropPress");
  expect(source).toContain("closeOnEscape");
});

test("native dialog stylesheet animates the real dialog backdrop", () => {
  const css = readFileSync(
    new URL("../../src/components/ui/nativeDialog.css", import.meta.url),
    "utf8",
  );

  expect(css).toContain("dialog::backdrop");
  expect(css).toContain('[data-state="open"]');
  expect(css).toContain('[data-state="closing"]');
  expect(css).toContain("prefers-reduced-motion");
});

test("settings dialog source no longer depends on base ui dialog primitives", () => {
  const source = readFileSync(
    new URL("../../src/components/settings/SettingsDialog.tsx", import.meta.url),
    "utf8",
  );

  expect(source).toContain('from "@/components/ui/NativeDialog"');
  expect(source).toContain("labelledBy={titleId}");
  expect(source).toContain("describedBy={descriptionId}");
  expect(source).toContain("Close settings");
  expect(source).not.toContain("@base-ui/react/dialog");
  expect(source).not.toContain("Dialog.Root");
  expect(source).not.toContain("Dialog.Portal");
});
