// @vitest-environment jsdom
import { Toast } from "@base-ui/react/toast";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import ToastStack from "@/components/ToastStack";
import { NativeDialog } from "@/components/ui/NativeDialog";
import { Select } from "@/components/ui/Select";

const AddToast = () => {
  const { add } = Toast.useToastManager();
  return <button onClick={() => add({ title: "Saved", timeout: 0 })}>Notify</button>;
};

const Fixture = ({ outer = false, inner = false, mounted = true }) => (
  <Toast.Provider>
    <AddToast />
    {mounted && (
      <NativeDialog open={outer} onOpenChange={() => {}} labelledBy="outer-title">
        <h2 id="outer-title">Settings</h2>
        <NativeDialog open={inner} onOpenChange={() => {}} labelledBy="inner-title">
          <h2 id="inner-title">Confirm</h2>
        </NativeDialog>
      </NativeDialog>
    )}
    <ToastStack
      render={(toast) => (
        <Toast.Content>
          <Toast.Title>{toast.title}</Toast.Title>
          <Toast.Close>Dismiss</Toast.Close>
        </Toast.Content>
      )}
    />
  </Toast.Provider>
);

const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    },
  });
});
afterEach(() => {
  cleanup();
  for (const [name, descriptor] of [
    ["showModal", originalShowModal],
    ["close", originalClose],
  ] as const) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
  vi.restoreAllMocks();
});

describe("native dialog interactions", () => {
  test("a Select click retargeted to the dialog does not close Settings", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <NativeDialog open onOpenChange={onOpenChange} labelledBy="settings-title">
        <h2 id="settings-title">Settings</h2>
        <label htmlFor="execution">Execution</label>
        <Select
          id="execution"
          value="local"
          onValueChange={() => {}}
          options={[
            { value: "local", label: "On this device" },
            { value: "cloud", label: "Cloud" },
          ]}
        />
      </NativeDialog>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Settings" });
    const trigger = screen.getByRole("combobox", { name: "Execution" });
    await user.click(trigger);
    expect(await screen.findByRole("listbox")).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.pointerDown(trigger);
    fireEvent.pointerUp(dialog);
    fireEvent.click(dialog);
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.pointerDown(dialog);
    fireEvent.pointerUp(dialog);
    fireEvent.click(dialog);
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });
});

describe("toast native dialog layering", () => {
  test("moves existing notifications into the dialog and back after closing", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Fixture />);
    await user.click(screen.getByRole("button", { name: "Notify" }));
    expect((await screen.findByText("Saved")).closest("dialog")).toBeNull();
    rerender(<Fixture outer />);
    await waitFor(() =>
      expect(screen.getByText("Saved").closest("dialog")).toBe(
        screen.getByRole("dialog", { name: "Settings" }),
      ),
    );
    rerender(<Fixture outer={false} />);
    await waitFor(() => expect(screen.getByText("Saved").closest("dialog")).toBeNull());
  });

  test("uses the topmost dialog and returns to its parent when the inner one closes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Fixture outer />);
    await user.click(screen.getByRole("button", { name: "Notify" }));
    rerender(<Fixture outer inner />);
    await waitFor(() =>
      expect(screen.getByText("Saved").closest("dialog")).toBe(
        screen.getByRole("dialog", { name: "Confirm" }),
      ),
    );
    rerender(<Fixture outer />);
    await waitFor(() =>
      expect(screen.getByText("Saved").closest("dialog")).toBe(
        screen.getByRole("dialog", { name: "Settings" }),
      ),
    );
    await user.click(screen.getByText("Dismiss"));
    await waitFor(() => expect(screen.queryByText("Saved")).toBeNull());
  });

  test("releases the container when an open dialog is unmounted", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Fixture outer />);
    await user.click(screen.getByRole("button", { name: "Notify" }));
    await waitFor(() => expect(screen.getByText("Saved").closest("dialog")).not.toBeNull());
    rerender(<Fixture mounted={false} />);
    await waitFor(() => expect(screen.getByText("Saved").closest("dialog")).toBeNull());
  });
});
