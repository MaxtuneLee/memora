import { type JSX, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";

function PointerTarget(): JSX.Element {
  const [pointerDown, setPointerDown] = useState(false);

  return (
    <button type="button" onPointerDown={() => setPointerDown(true)}>
      {pointerDown ? "Pointer received" : "Press me"}
    </button>
  );
}

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(() => {
  root?.unmount();
  root = undefined;
  container?.remove();
  container = undefined;
});

describe("Vitest browser mode", () => {
  it("delivers a real pointer interaction to a mounted React component", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    root.render(<PointerTarget />);

    const target = page.getByRole("button", { name: "Press me" });
    await target.click();

    await expect.element(page.getByRole("button", { name: "Pointer received" })).toBeVisible();
  });
});
