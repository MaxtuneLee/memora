import type {
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import { $getNodeByKey, DecoratorNode, createCommand } from "lexical";
import { useEffect, useRef, type JSX } from "react";
import * as stylex from "@stylexjs/stylex";

import { tokens } from "../../../styles/stylex.stylex";

const styles = stylex.create({
  textarea: {
    backgroundColor: tokens.warningSurface,
    borderColor: tokens.warningBorder,
    borderRadius: 12,
    borderStyle: "solid",
    borderWidth: 1,
    color: tokens.text,
    display: "block",
    fieldSizing: "content",
    fontFamily: "monospace",
    fontSize: 14,
    lineHeight: 1.6,
    marginBlock: 8,
    minHeight: "2.5rem",
    outline: "none",
    paddingBlock: 10,
    paddingInline: 14,
    resize: "none",
    whiteSpace: "pre-wrap",
    width: "100%",
    ":focus-visible": { borderColor: tokens.oliveSoft },
  },
});

/** Sent with the node key when the user leaves a Markdown block, so it can render if now valid. */
export const RAW_MARKDOWN_BLUR_COMMAND = createCommand<NodeKey>("RAW_MARKDOWN_BLUR_COMMAND");

// Events Lexical would otherwise handle as if typed into the rich text around the block.
const ISOLATED_EVENTS = [
  "beforeinput",
  "click",
  "compositionend",
  "compositionstart",
  "copy",
  "cut",
  "drop",
  "keydown",
  "keyup",
  "mousedown",
  "paste",
  "pointerdown",
] as const;

function RawMarkdownBlock({
  editor,
  nodeKey,
  text,
}: {
  editor: LexicalEditor;
  nodeKey: NodeKey;
  text: string;
}): JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Undo, redo, and chat edits change the node; typing changes the textarea first.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea && textarea.value !== text) {
      textarea.value = text;
    }
  }, [text]);

  // Native listeners, because stopping these events from reaching Lexical also keeps them from
  // React's root listener, so React's onChange would never run.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    const stop = (event: Event): void => event.stopPropagation();
    const handleInput = (event: Event): void => {
      event.stopPropagation();
      const nextText = textarea.value;
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if ($isRawMarkdownNode(node)) {
          node.setText(nextText);
        }
      });
    };
    const handleBlur = (): void => {
      editor.dispatchCommand(RAW_MARKDOWN_BLUR_COMMAND, nodeKey);
    };
    for (const type of ISOLATED_EVENTS) {
      textarea.addEventListener(type, stop);
    }
    textarea.addEventListener("input", handleInput);
    textarea.addEventListener("blur", handleBlur);
    return () => {
      for (const type of ISOLATED_EVENTS) {
        textarea.removeEventListener(type, stop);
      }
      textarea.removeEventListener("input", handleInput);
      textarea.removeEventListener("blur", handleBlur);
    };
  }, [editor, nodeKey]);

  return (
    <textarea
      ref={textareaRef}
      aria-label="Markdown Preview cannot show"
      title="Preview cannot show this Markdown as written. Fix it here; it renders once you leave the block."
      spellCheck={false}
      defaultValue={text}
      {...stylex.props(styles.textarea)}
    />
  );
}

export type SerializedRawMarkdownNode = Spread<
  { text: string; type: "raw-markdown"; version: 1 },
  SerializedLexicalNode
>;

/**
 * Markdown that Preview cannot convert without changing it, kept as editable source so the rest
 * of the note can still be edited in Preview. It exports its text unchanged.
 */
export class RawMarkdownNode extends DecoratorNode<JSX.Element> {
  __text: string;

  static getType(): string {
    return "raw-markdown";
  }

  static clone(node: RawMarkdownNode): RawMarkdownNode {
    return new RawMarkdownNode(node.__text, node.__key);
  }

  static importJSON(serializedNode: SerializedRawMarkdownNode): RawMarkdownNode {
    return new RawMarkdownNode(serializedNode.text).updateFromJSON(serializedNode);
  }

  constructor(text: string, key?: NodeKey) {
    super(key);
    this.__text = text;
  }

  exportJSON(): SerializedRawMarkdownNode {
    return { ...super.exportJSON(), text: this.__text, type: "raw-markdown", version: 1 };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement("div");
    element.contentEditable = "false";
    return element;
  }

  updateDOM(): false {
    return false;
  }

  isInline(): false {
    return false;
  }

  getText(): string {
    return this.getLatest().__text;
  }

  setText(text: string): void {
    if (this.getLatest().__text !== text) {
      this.getWritable().__text = text;
    }
  }

  getTextContent(): string {
    return this.getLatest().__text;
  }

  decorate(editor: LexicalEditor): JSX.Element {
    return <RawMarkdownBlock editor={editor} nodeKey={this.__key} text={this.__text} />;
  }
}

export const $createRawMarkdownNode = (text: string): RawMarkdownNode => {
  return new RawMarkdownNode(text);
};

export const $isRawMarkdownNode = (
  node: LexicalNode | null | undefined,
): node is RawMarkdownNode => {
  return node instanceof RawMarkdownNode;
};
