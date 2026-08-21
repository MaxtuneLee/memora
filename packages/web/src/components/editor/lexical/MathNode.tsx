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
    element.className = this.__displayMode
      ? "my-4 overflow-x-auto py-2 text-center"
      : "inline-block align-baseline";
    return element;
  }

  updateDOM(prevNode: MathNode, dom: HTMLElement): boolean {
    if (prevNode.__displayMode !== this.__displayMode) {
      return true;
    }

    dom.className = this.__displayMode
      ? "my-4 overflow-x-auto py-2 text-center"
      : "inline-block align-baseline";
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
          className="my-4 flex flex-col gap-2"
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={0}
        >
          <code className="block whitespace-pre-wrap rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left font-mono text-sm text-zinc-900">
            {getMathSourceText(this.__formula)}
          </code>
          <span
            className="text-[var(--color-memora-text)]"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      );
    }

    if (this.__markdownSourceActive) {
      return (
        <span
          aria-haspopup="dialog"
          aria-label="Edit formula"
          className="inline-block whitespace-pre-wrap rounded-md bg-zinc-50 px-1.5 py-0.5 font-mono text-[0.92em] text-zinc-900 align-baseline"
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={0}
        >
          {getMathSourceText(this.__formula, this.__inlineDelimiter)}
        </span>
      );
    }

    const className = this.__displayMode
      ? "text-[var(--color-memora-text)]"
      : "text-[var(--color-memora-text)]";
    return (
      <span
        aria-haspopup="dialog"
        aria-label="Edit formula"
        className={className}
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
