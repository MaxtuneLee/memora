// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { Select } from "@/components/ui/Select";

afterEach(cleanup);

const options = [
  { value: "local", label: "On this device" },
  { value: "cloud", label: "Cloud" },
];

describe("Select dropdown layering", () => {
  test("uses anchored positioning and a contained scrolling list without growing the popup", async () => {
    const user = userEvent.setup();
    render(
      <Select
        value="model-0"
        onValueChange={() => {}}
        options={Array.from({ length: 60 }, (_, index) => ({
          value: `model-${index}`,
          label: `Model ${index}`,
        }))}
      />,
    );
    await user.click(screen.getByRole("combobox"));
    const list = await screen.findByRole("listbox");
    const popup = list.parentElement;
    const positioner = popup?.parentElement;
    expect(positioner?.style.position).toBe("fixed");
    expect(positioner?.getAttribute("data-side")).not.toBe("none");
    expect(list).toHaveClass("overflow-y-auto", "overscroll-contain");
    expect(popup).toHaveClass("overflow-hidden");
    const before = positioner?.getAttribute("style");
    fireEvent.scroll(list, { target: { scrollTop: 120 } });
    expect(positioner?.getAttribute("style")).toBe(before);
    expect(screen.getByRole("listbox")).toBe(list);
  });
  test("portals into its native dialog, outside the clipping panel", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <dialog open aria-label="Settings">
        <div data-testid="panel" style={{ overflow: "hidden", transform: "scale(1)" }}>
          <label htmlFor="execution">Execution</label>
          <Select id="execution" value="local" onValueChange={onValueChange} options={options} />
        </div>
      </dialog>,
    );
    await user.click(screen.getByRole("combobox", { name: "Execution" }));
    const popup = await screen.findByRole("listbox");
    expect(screen.getByRole("dialog").contains(popup)).toBe(true);
    expect(screen.getByTestId("panel").contains(popup)).toBe(false);
    await user.click(within(popup).getByRole("option", { name: "Cloud" }));
    expect(onValueChange).toHaveBeenCalledWith("cloud");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("uses the nearest dialog when dialogs are nested", async () => {
    const user = userEvent.setup();
    render(
      <dialog open aria-label="Outer">
        <dialog open aria-label="Inner">
          <label htmlFor="nested">Execution</label>
          <Select id="nested" value="local" onValueChange={() => {}} options={options} />
        </dialog>
      </dialog>,
    );
    await user.click(screen.getByRole("combobox", { name: "Execution" }));
    const popup = await screen.findByRole("listbox");
    expect(popup.closest("dialog")).toBe(screen.getByRole("dialog", { name: "Inner" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Execution" })).toHaveFocus();
  });

  test("keeps the normal body portal outside a dialog", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Select value="local" onValueChange={() => {}} options={options} />,
    );
    await user.click(screen.getByRole("combobox"));
    const popup = await screen.findByRole("listbox");
    expect(document.body.contains(popup)).toBe(true);
    expect(container.contains(popup)).toBe(false);
  });
});
