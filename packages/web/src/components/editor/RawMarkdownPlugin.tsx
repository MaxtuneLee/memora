import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNodeByKey, COMMAND_PRIORITY_EDITOR } from "lexical";

import {
  $isRawMarkdownNode,
  RAW_MARKDOWN_BLUR_COMMAND,
} from "@/components/editor/lexical/RawMarkdownNode";
import {
  preflightMarkdownForWysiwyg,
  prepareMarkdownForWysiwyg,
} from "@/lib/editor/markdownRoundTripGuard";
import { exportWysiwygMarkdown, importWysiwygMarkdown } from "@/lib/editor/wysiwygMarkdownConfig";

/** Renders a Markdown source block as formatted text once the user leaves it valid. */
export function RawMarkdownPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      RAW_MARKDOWN_BLUR_COMMAND,
      (nodeKey) => {
        const node = $getNodeByKey(nodeKey);
        if (!$isRawMarkdownNode(node)) {
          return true;
        }
        const text = node.getText();
        // The checks convert in a separate editor, so run them outside this update.
        queueMicrotask(() => {
          const result = preflightMarkdownForWysiwyg(text);
          if (!result.safe || result.importMarkdown !== undefined) {
            return;
          }
          // Reload the whole note the way it opens, so the block converts in its real context;
          // source blocks export unchanged, and blocks that still cannot convert stay source.
          const markdown = prepareMarkdownForWysiwyg(
            exportWysiwygMarkdown(editor.getEditorState()),
          );
          editor.update(() => {
            importWysiwygMarkdown(markdown);
          });
        });
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    );
  }, [editor]);

  return null;
}
