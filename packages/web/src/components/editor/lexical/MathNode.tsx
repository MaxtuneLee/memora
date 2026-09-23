import type {
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import { $createNodeSelection, $setSelection, DecoratorNode } from "lexical";
import type { JSX, KeyboardEvent, MouseEvent } from "react";
import katex from "katex";
import * as stylex from "@stylexjs/stylex";
import { tokens } from "../../../styles/stylex.stylex";

const styles = stylex.create({
  displayDom: { marginBlock: 16, overflowX: "auto", paddingBlock: 8, textAlign: "center" },
  inlineDom: { display: "inline-block", verticalAlign: "baseline" },
  sourceBlock: { display: "flex", flexDirection: "column", gap: 8, marginBlock: 16 },
  code: {
    backgroundColor: tokens.surfaceMuted,
    border: `1px solid ${tokens.borderSoft}`,
    borderRadius: 12,
    color: tokens.text,
    display: "block",
    fontFamily: "monospace",
    fontSize: 14,
    paddingBlock: 12,
    paddingInline: 16,
    textAlign: "left",
    whiteSpace: "pre-wrap",
  },
  text: { color: tokens.text },
  inlineSource: {
    backgroundColor: tokens.surfaceMuted,
    borderRadius: 6,
    color: tokens.text,
    display: "inline-block",
    fontFamily: "monospace",
    fontSize: "0.92em",
    paddingBlock: 2,
    paddingInline: 6,
    verticalAlign: "baseline",
    whiteSpace: "pre-wrap",
  },
});
const displayDomClassName = stylex.props(styles.displayDom).className ?? "";
const inlineDomClassName = stylex.props(styles.inlineDom).className ?? "";

export type InlineMathDelimiter = "$" | "$$";

const getMathSourceText = (formula: string, delimiter: InlineMathDelimiter = "$$"): string => {
  return `${delimiter}${formula}${delimiter}`;
};

export type SerializedMathNode = Spread<
  {
    displayMode: boolean;
    formula: string;
    inlineDelimiter?: InlineMathDelimiter;
    multilineMarkdown: boolean;
    type: "math";
    version: 1;
  },
  SerializedLexicalNode
>;

export class MathNode extends DecoratorNode<JSX.Element> {
  __formula: string;
  __displayMode: boolean;
  __inlineDelimiter: InlineMathDelimiter;
  __markdownSourceActive: boolean;
  __multilineMarkdown: boolean;

  static getType(): string {
    return "math";
  }

  static clone(node: MathNode): MathNode {
    const clone = new MathNode(
      node.__formula,
      node.__displayMode,
      node.__key,
      node.__multilineMarkdown,
      node.__inlineDelimiter,
    );
    clone.__markdownSourceActive = node.__markdownSourceActive;
    return clone;
  }

  static importJSON(serializedNode: SerializedMathNode): MathNode {
    return new MathNode(
      serializedNode.formula,
      serializedNode.displayMode,
      undefined,
      serializedNode.multilineMarkdown ?? false,
      serializedNode.inlineDelimiter ?? "$$",
    );
  }

  constructor(
    formula: string,
    displayMode = false,
    key?: NodeKey,
    multilineMarkdown = false,
    inlineDelimiter: InlineMathDelimiter = "$$",
  ) {
    super(key);
    this.__formula = formula;
    this.__displayMode = displayMode;
    this.__inlineDelimiter = inlineDelimiter;
    this.__markdownSourceActive = false;
    this.__multilineMarkdown = multilineMarkdown;
  }

  exportJSON(): SerializedMathNode {
    return {
      ...super.exportJSON(),
      displayMode: this.__displayMode,
      formula: this.__formula,
      inlineDelimiter: this.__inlineDelimiter,
      multilineMarkdown: this.__multilineMarkdown,
      type: "math",
      version: 1,
    };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement(this.__displayMode ? "div" : "span");
    element.className = this.__displayMode ? displayDomClassName : inlineDomClassName;
    return element;
  }

  updateDOM(prevNode: MathNode, dom: HTMLElement): boolean {
    if (prevNode.__displayMode !== this.__displayMode) {
      return true;
    }

    dom.className = this.__displayMode ? displayDomClassName : inlineDomClassName;
    return false;
  }

  isInline(): boolean {
    return !this.__displayMode;
  }

  getFormula(): string {
    return this.__formula;
  }

  setFormula(formula: string): this {
    if (this.getLatest().__formula === formula) {
      return this;
    }

    const self = this.getWritable();
    self.__formula = formula;
    return self;
  }

  getDisplayMode(): boolean {
    return this.__displayMode;
  }

  getInlineDelimiter(): InlineMathDelimiter {
    return this.__inlineDelimiter;
  }

  usesMultilineMarkdown(): boolean {
    return this.__multilineMarkdown;
  }

  isMarkdownSourceActive(): boolean {
    return this.getLatest().__markdownSourceActive;
  }

  setMarkdownSourceActive(isActive: boolean): this {
    if (this.getLatest().__markdownSourceActive === isActive) {
      return this;
    }

    const self = this.getWritable();
    self.__markdownSourceActive = isActive;
    return self;
  }

  getTextContent(): string {
    return getMathSourceText(this.__formula, this.__displayMode ? "$$" : this.__inlineDelimiter);
  }

  decorate(editor: LexicalEditor, _config: EditorConfig): JSX.Element {
    const selectFormula = (): void => {
      editor.update(
        () => {
          const selection = $createNodeSelection();
          selection.add(this.getKey());
          $setSelection(selection);
        },
        {
          discrete: true,
        },
      );
    };
    const handleClick = (event: MouseEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      selectFormula();
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      selectFormula();
    };

    const html = katex.renderToString(this.__formula, {
      displayMode: this.__displayMode,
      output: "html",
      throwOnError: false,
    });

    if (this.__markdownSourceActive && this.__displayMode) {
      return (
        <div
          aria-haspopup="dialog"
          aria-label="Edit formula"
          {...stylex.props(styles.sourceBlock)}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={0}
        >
          <code {...stylex.props(styles.code)}>{getMathSourceText(this.__formula)}</code>
          <span {...stylex.props(styles.text)} dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      );
    }

    if (this.__markdownSourceActive) {
      return (
        <span
          aria-haspopup="dialog"
          aria-label="Edit formula"
          {...stylex.props(styles.inlineSource)}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={0}
        >
          {getMathSourceText(this.__formula, this.__inlineDelimiter)}
        </span>
      );
    }

    return (
      <span
        aria-haspopup="dialog"
        aria-label="Edit formula"
        {...stylex.props(styles.text)}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
}

export const $createMathNode = (
  formula: string,
  displayMode = false,
  multilineMarkdown = false,
  inlineDelimiter: InlineMathDelimiter = "$$",
): MathNode => {
  return new MathNode(formula, displayMode, undefined, multilineMarkdown, inlineDelimiter);
};

export const $isMathNode = (node: LexicalNode | null | undefined): node is MathNode => {
  return node instanceof MathNode;
};

export const getMathNodeSourceText = (
  formula: string,
  delimiter: InlineMathDelimiter = "$$",
): string => {
  return getMathSourceText(formula, delimiter);
};
