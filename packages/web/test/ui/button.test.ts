import { readFileSync } from "node:fs";

import { expect, test } from "vite-plus/test";

test("shared controls expose the settings control variants", () => {
  const buttonSource = readFileSync(
    new URL("../../src/components/ui/Button.tsx", import.meta.url),
    "utf8",
  );
  const switchSource = readFileSync(
    new URL("../../src/components/ui/Switch.tsx", import.meta.url),
    "utf8",
  );
  const badgeSource = readFileSync(
    new URL("../../src/components/ui/Badge.tsx", import.meta.url),
    "utf8",
  );
  const inputSource = readFileSync(
    new URL("../../src/components/ui/Input.tsx", import.meta.url),
    "utf8",
  );
  const selectSource = readFileSync(
    new URL("../../src/components/ui/Select.tsx", import.meta.url),
    "utf8",
  );
  const progressSource = readFileSync(
    new URL("../../src/components/ui/Progress.tsx", import.meta.url),
    "utf8",
  );

  expect(buttonSource).toContain('"primary"');
  expect(buttonSource).toContain('"secondary"');
  expect(buttonSource).toContain('"oliveGhost"');
  expect(buttonSource).toContain('"destructive"');
  expect(buttonSource).toContain('"segment"');
  expect(switchSource).toContain("BaseSwitch.Root");
  expect(switchSource).toContain("BaseSwitch.Thumb");
  expect(badgeSource).toContain('"neutral"');
  expect(badgeSource).toContain('"olive"');
  expect(inputSource).toContain("function Input");
  expect(selectSource).toContain("BaseSelect.Root");
  expect(selectSource).toContain("justify-start");
  expect(progressSource).toContain("BaseProgress.Root");
  expect(progressSource).toContain("BaseProgress.Indicator");
});
