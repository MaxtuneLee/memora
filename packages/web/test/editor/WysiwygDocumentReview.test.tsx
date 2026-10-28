// @vitest-environment jsdom
import { fireEvent, render, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { WysiwygDocumentEditor } from "@/components/editor/WysiwygDocumentEditor";

const BASE = "# Title\n\nOld line\n";
const PROPOSED = "# Title\n\nNew line\n";

it("shows chat changes as a diff and reports accepted and rejected changes", async () => {
  const onTextChange = vi.fn();
  const onAcceptText = vi.fn();
  const onProposalChange = vi.fn();
  const { container, rerender } = render(
    <WysiwygDocumentEditor text={BASE} onTextChange={onTextChange} />,
  );
  await waitFor(() => expect(container.querySelector(".cm-content")).not.toBeNull());

  const review = { proposedText: PROPOSED, onAcceptText, onProposalChange };
  rerender(<WysiwygDocumentEditor text={BASE} review={review} onTextChange={onTextChange} />);
  await waitFor(() => expect(container.querySelector(".cm-md-diff-accept")).not.toBeNull());
  expect(container.textContent).toContain("New line");

  fireEvent.mouseDown(container.querySelector(".cm-md-diff-accept") as HTMLElement);
  await waitFor(() => expect(onAcceptText).toHaveBeenCalledWith(PROPOSED));
  expect(onTextChange).not.toHaveBeenCalled();

  rerender(<WysiwygDocumentEditor text={BASE} onTextChange={onTextChange} />);
  rerender(<WysiwygDocumentEditor text={BASE} review={review} onTextChange={onTextChange} />);
  await waitFor(() => expect(container.querySelector(".cm-md-diff-reject")).not.toBeNull());
  fireEvent.mouseDown(container.querySelector(".cm-md-diff-reject") as HTMLElement);
  await waitFor(() => expect(onProposalChange).toHaveBeenCalledWith(BASE));
});
