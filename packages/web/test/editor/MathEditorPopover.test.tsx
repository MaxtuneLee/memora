import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

let WysiwygDocumentEditor: typeof import("@/components/editor/WysiwygDocumentEditor").WysiwygDocumentEditor;

const setupDom = (): void => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  const requestAnimationFrame = (callback: FrameRequestCallback) => {
    return dom.window.setTimeout(() => callback(0), 0);
  };
  const cancelAnimationFrame = (handle: number) => {
    dom.window.clearTimeout(handle);
  };

  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  class IntersectionObserver {
    readonly root = null;
    readonly rootMargin = "0px";
    readonly thresholds = [0];
    disconnect() {}
    observe() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
    unobserve() {}
  }

  Object.defineProperty(dom.window.HTMLElement.prototype, "attachEvent", {
    configurable: true,
    value() {},
  });
  Object.defineProperty(dom.window.HTMLElement.prototype, "detachEvent", {
    configurable: true,
    value() {},
  });
  Object.defineProperty(dom.window.HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => new dom.window.DOMRect(120, 80, 100, 24),
  });
  Object.defineProperty(dom.window.Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => new dom.window.DOMRect(120, 80, 100, 24),
  });
  dom.window.requestAnimationFrame = requestAnimationFrame;
  dom.window.cancelAnimationFrame = cancelAnimationFrame;

  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("navigator", dom.window.navigator);
  vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
  vi.stubGlobal("HTMLInputElement", dom.window.HTMLInputElement);
  vi.stubGlobal("HTMLTextAreaElement", dom.window.HTMLTextAreaElement);
  vi.stubGlobal("Element", dom.window.Element);
  vi.stubGlobal("Document", dom.window.Document);
  vi.stubGlobal("SVGElement", dom.window.SVGElement);
  vi.stubGlobal("DOMRect", dom.window.DOMRect);
  vi.stubGlobal("Event", dom.window.Event);
  vi.stubGlobal("KeyboardEvent", dom.window.KeyboardEvent);
  vi.stubGlobal("MouseEvent", dom.window.MouseEvent);
  vi.stubGlobal("MutationObserver", dom.window.MutationObserver);
  vi.stubGlobal("Node", dom.window.Node);
  vi.stubGlobal("NodeFilter", dom.window.NodeFilter);
  vi.stubGlobal("Range", dom.window.Range);
  vi.stubGlobal("Text", dom.window.Text);
  vi.stubGlobal("ResizeObserver", ResizeObserver);
  vi.stubGlobal("IntersectionObserver", IntersectionObserver);
  vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
  vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
  vi.stubGlobal("getComputedStyle", dom.window.getComputedStyle.bind(dom.window));
};

const clickRenderedFormula = async (container: HTMLElement, index = 0): Promise<void> => {
  const formula = await waitFor(() => {
    const element = container.querySelectorAll<HTMLElement>(".katex")[index]?.parentElement;
    expect(element).not.toBeNull();
    return element!;
  });
  fireEvent.click(formula);
};

beforeEach(async () => {
  setupDom();
  ({ WysiwygDocumentEditor } = await import("@/components/editor/WysiwygDocumentEditor"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("opens a single-line LaTeX editor when an inline formula is clicked", async () => {
  const view = render(
    <WysiwygDocumentEditor text="Inline $$E=mc^2$$ formula" onTextChange={() => {}} />,
  );

  await clickRenderedFormula(view.container);

  const field = await view.findByRole("textbox", { name: "LaTeX" });
  expect(field.tagName).toBe("INPUT");
  expect((field as HTMLInputElement).value).toBe("E=mc^2");
  expect(view.getByRole("dialog", { name: "Edit formula" })).not.toBeNull();
  expect(view.getByText(/Inline formula/)).not.toBeNull();
});

test("opens the formula editor from the keyboard", async () => {
  const view = render(
    <WysiwygDocumentEditor text="Inline $$E=mc^2$$ formula" onTextChange={() => {}} />,
  );
  const formula = await waitFor(() => {
    const element = view.container.querySelector<HTMLElement>(".katex")?.parentElement;
    expect(element).not.toBeNull();
    return element!;
  });

  formula.focus();
  fireEvent.keyDown(formula, { key: "Enter" });

  expect(await view.findByRole("dialog", { name: "Edit formula" })).not.toBeNull();
});

test("opens a multiline LaTeX editor for a block formula", async () => {
  const formula = "\\begin{aligned}\nx &= y + 1 \\\\\ny &= 2\n\\end{aligned}";
  const view = render(
    <WysiwygDocumentEditor text={`$$\n${formula}\n$$`} onTextChange={() => {}} />,
  );

  await clickRenderedFormula(view.container);

  const field = await view.findByRole("textbox", { name: "LaTeX" });
  expect(field.tagName).toBe("TEXTAREA");
  expect((field as HTMLTextAreaElement).value).toBe(formula);
  expect(view.getByText(/Block formula/)).not.toBeNull();
});

test("writes the edited formula after 300 ms of inactivity", async () => {
  const onTextChange = vi.fn();
  const view = render(
    <WysiwygDocumentEditor text="Inline $$E=mc^2$$ formula" onTextChange={onTextChange} />,
  );
  await clickRenderedFormula(view.container);
  const field = await view.findByRole("textbox", { name: "LaTeX" });
  onTextChange.mockClear();
  const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
  const user = userEvent.setup({ document: window.document });

  await user.clear(field);
  await user.type(field, "x^2+y^2");
  expect((field as HTMLInputElement).value).toBe("x^2+y^2");
  expect(setTimeoutSpy.mock.calls.some(([, delay]) => delay === 300)).toBe(true);
  await act(() => new Promise((resolve) => setTimeout(resolve, 250)));
  expect(onTextChange).not.toHaveBeenCalledWith(expect.stringContaining("x^2+y^2"));

  await waitFor(() => {
    expect(onTextChange).toHaveBeenCalledWith(expect.stringContaining("x^2+y^2"));
  });
});

test("flushes the pending formula update when the popover closes", async () => {
  const onTextChange = vi.fn();
  const view = render(
    <WysiwygDocumentEditor text="Inline $$E=mc^2$$ formula" onTextChange={onTextChange} />,
  );
  await clickRenderedFormula(view.container);
  const field = await view.findByRole("textbox", { name: "LaTeX" });
  const user = userEvent.setup({ document: window.document });
  onTextChange.mockClear();

  await user.clear(field);
  await user.type(field, "a+b");
  await user.keyboard("{Escape}");

  await waitFor(() => {
    expect(view.queryByRole("dialog", { name: "Edit formula" })).toBeNull();
    expect(onTextChange).toHaveBeenCalledWith(expect.stringContaining("a+b"));
  });
});

test("flushes the previous draft when another formula is selected", async () => {
  const onTextChange = vi.fn();
  const view = render(
    <WysiwygDocumentEditor text="First $$a$$ and second $$b$$" onTextChange={onTextChange} />,
  );

  await clickRenderedFormula(view.container, 0);
  const firstField = await view.findByRole("textbox", { name: "LaTeX" });
  expect((firstField as HTMLInputElement).value).toBe("a");
  const user = userEvent.setup({ document: window.document });
  onTextChange.mockClear();
  await user.clear(firstField);
  await user.type(firstField, "c");

  await clickRenderedFormula(view.container, 1);
  await waitFor(() => {
    const secondField = view.getByRole("textbox", { name: "LaTeX" });
    expect((secondField as HTMLInputElement).value).toBe("b");
    expect(onTextChange).toHaveBeenCalledWith(expect.stringContaining("First $$c$$"));
  });
});
