// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { WysiwygDocumentEditor } from "@/components/editor/WysiwygDocumentEditor";

const BASE = "# Title\n\nHello **bold** text\n\nOld line\n\nTail $a+b$ end\n";
const PROPOSED = "# Title\n\nHello **bold** text\n\nNew line\n\nTail $a+b$ end\n";

it("renders unchanged blocks as usual and only the changed one as a change", async () => {
  const onTextChange = vi.fn();
  const onAcceptHunk = vi.fn();
  const { container, rerender } = render(
    <WysiwygDocumentEditor text={BASE} onTextChange={onTextChange} />,
  );
  await waitFor(() => expect(container.querySelector("strong")).not.toBeNull());

  rerender(
    <WysiwygDocumentEditor
      text={BASE}
      review={{ proposedText: PROPOSED, onAcceptHunk, onRejectHunk: vi.fn() }}
      onTextChange={onTextChange}
    />,
  );
  await waitFor(() => expect(screen.getByTestId("document-change")).not.toBeNull());

  expect(container.querySelector("strong")?.textContent).toBe("bold");
  expect(container.querySelector(".katex")).not.toBeNull();
  expect(container.querySelector("h1")?.textContent).toBe("Title");
  expect(screen.getByTestId("document-change").textContent).toContain("New");
  screen.getByLabelText("Accept change 1").click();
  expect(onAcceptHunk).toHaveBeenCalledTimes(1);
  expect(onTextChange).not.toHaveBeenCalled();

  rerender(<WysiwygDocumentEditor text={PROPOSED} onTextChange={onTextChange} />);
  await waitFor(() => expect(screen.queryByTestId("document-change")).toBeNull());
  expect(container.textContent).toContain("New line");
});
