import { useEffect } from "react";
import { $isCodeNode } from "@lexical/code";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $findCellNode } from "@lexical/table";
import {
  $findMatchingParent,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  COMMAND_PRIORITY_NORMAL,
  PASTE_COMMAND,
} from "lexical";

import { $createNodesFromMarkdown } from "@/lib/editor/wysiwygMarkdownConfig";

const LEXICAL_CLIPBOARD_TYPE = "application/x-lexical-editor";

// Plain-text clipboard content is read as markdown, so pasting "**bold**" or a pipe table from a
// .md file shows formatted content instead of escaped markers. Rich HTML pastes keep Lexical's
// own handling, and code blocks always receive the text as-is.
export function MarkdownPastePlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        const clipboardData = "clipboardData" in event ? event.clipboardData : null;
        const text = clipboardData?.getData("text/plain") ?? "";
        if (
          !clipboardData ||
          !text ||
          clipboardData.types.includes("text/html") ||
          clipboardData.types.includes(LEXICAL_CLIPBOARD_TYPE)
        ) {
          return false;
        }

        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return false;
        }

        const anchorNode = selection.anchor.getNode();
        if ($findMatchingParent(anchorNode, $isCodeNode)) {
          return false;
        }

        const isInTableCell = $findCellNode(anchorNode) !== null;
        if (isInTableCell && text.includes("\n")) {
          return false;
        }

        const nodes = $createNodesFromMarkdown(text);
        const firstNode = nodes[0];
        const insertionSelection = $getSelection();
        if (!$isRangeSelection(insertionSelection)) {
          return false;
        }

        if (nodes.length === 1 && $isParagraphNode(firstNode)) {
          event.preventDefault();
          insertionSelection.insertNodes(firstNode.getChildren());
          return true;
        }
        if (isInTableCell) {
          return false;
        }

        event.preventDefault();
        // Keep a pasted heading, list, or table as its own block instead of merging its text
        // into the line under the caret.
        const currentBlock = insertionSelection.anchor.getNode().getTopLevelElement();
        if (!$isParagraphNode(firstNode) && currentBlock && currentBlock.getTextContentSize() > 0) {
          insertionSelection.insertParagraph();
        }
        $getSelection()?.insertNodes(nodes);
        return true;
      },
      COMMAND_PRIORITY_NORMAL,
    );
  }, [editor]);

  return null;
}
