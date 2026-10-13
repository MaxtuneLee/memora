import type { EditorConfig, LexicalNode, NodeKey, SerializedLexicalNode, Spread } from "lexical";
import { DecoratorNode } from "lexical";
import { createContext, useContext, type JSX } from "react";
import * as stylex from "@stylexjs/stylex";

import { InlineChange } from "@/components/editor/DocumentChangeReview";

const styles = stylex.create({
  block: {
    marginBlock: 8,
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
  },
});

export interface DiffHunkItem {
  added: string;
  removed: string;
}

export interface DiffReviewValue {
  hunks: readonly DiffHunkItem[];
  onAccept: (index: number) => void;
  onReject: (index: number) => void;
}

/** Gives the change blocks of a note under review their text and the accept and reject actions. */
export const DiffReviewContext = createContext<DiffReviewValue | null>(null);

function DiffHunkBlock({ index }: { index: number }): JSX.Element | null {
  const review = useContext(DiffReviewContext);
  const hunk = review?.hunks[index];
  if (!review || !hunk) {
    return null;
  }
  return (
    <div {...stylex.props(styles.block)}>
      <InlineChange
        index={index}
        removed={hunk.removed}
        added={hunk.added}
        onAccept={() => review.onAccept(index)}
        onReject={() => review.onReject(index)}
      />
    </div>
  );
}

export type SerializedDiffHunkNode = Spread<
  { hunkIndex: number; type: "diff-hunk"; version: 1 },
  SerializedLexicalNode
>;

/** One change from chat, shown as the Markdown that would change while the rest of the note renders. */
export class DiffHunkNode extends DecoratorNode<JSX.Element> {
  __hunkIndex: number;

  static getType(): string {
    return "diff-hunk";
  }

  static clone(node: DiffHunkNode): DiffHunkNode {
    return new DiffHunkNode(node.__hunkIndex, node.__key);
  }

  static importJSON(serializedNode: SerializedDiffHunkNode): DiffHunkNode {
    return new DiffHunkNode(serializedNode.hunkIndex).updateFromJSON(serializedNode);
  }

  constructor(hunkIndex: number, key?: NodeKey) {
    super(key);
    this.__hunkIndex = hunkIndex;
  }

  exportJSON(): SerializedDiffHunkNode {
    return { ...super.exportJSON(), hunkIndex: this.__hunkIndex, type: "diff-hunk", version: 1 };
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

  getHunkIndex(): number {
    return this.getLatest().__hunkIndex;
  }

  getTextContent(): string {
    return "";
  }

  decorate(): JSX.Element {
    return <DiffHunkBlock index={this.__hunkIndex} />;
  }
}

export const $createDiffHunkNode = (hunkIndex: number): DiffHunkNode => new DiffHunkNode(hunkIndex);

export const $isDiffHunkNode = (node: LexicalNode | null | undefined): node is DiffHunkNode => {
  return node instanceof DiffHunkNode;
};
