import { ListItemNode, $isListNode, type SerializedListItemNode } from "@lexical/list";
import { HeadingNode, type HeadingTagType, type SerializedHeadingNode } from "@lexical/rich-text";
import type { EditorConfig, LexicalNode, LexicalUpdateJSON, NodeKey } from "lexical";

export const getMarkdownSourceMarkerOffset = (markdownSourcePrefix: string): string => {
  return `-${Math.max(markdownSourcePrefix.length + 0.5, 2.5)}ch`;
};

const updateMarkdownSourceDOM = (
  element: HTMLElement,
  markdownSourcePrefix: string | null,
  options?: {
    hideListMarker?: boolean;
    textLikeMarker?: boolean;
  },
): void => {
  if (!markdownSourcePrefix) {
    element.removeAttribute("data-active-markdown-source");
    if (options?.hideListMarker) {
      element.style.listStyleType = "";
      const parentElement = element.parentElement;
      if (parentElement?.tagName === "UL" || parentElement?.tagName === "OL") {
        parentElement.style.marginLeft = "";
        parentElement.style.paddingLeft = "";
        parentElement.style.listStyleType = "";
      }
    }
    return;
  }

  element.setAttribute("data-active-markdown-source", "true");
  element.style.whiteSpace = "pre-wrap";
  if (options?.hideListMarker) {
    element.style.listStyleType = "none";
    const parentElement = element.parentElement;
    if (parentElement?.tagName === "UL" || parentElement?.tagName === "OL") {
      parentElement.style.marginLeft = "";
      parentElement.style.paddingLeft = "";
      parentElement.style.listStyleType = "none";
    }
  }
};

export class MarkdownHeadingNode extends HeadingNode {
  __markdownSourcePrefix: string | null;

  static getType(): string {
    return "markdown-heading";
  }

  static clone(node: MarkdownHeadingNode): MarkdownHeadingNode {
    return new MarkdownHeadingNode(node.__tag, node.__key, node.__markdownSourcePrefix);
  }

  static importJSON(serializedNode: SerializedHeadingNode): MarkdownHeadingNode {
    return new MarkdownHeadingNode().updateFromJSON(serializedNode);
  }

  constructor(
    tag: HeadingTagType = "h1",
    key?: NodeKey,
    markdownSourcePrefix: string | null = null,
  ) {
    super(tag, key);
    this.__markdownSourcePrefix = markdownSourcePrefix;
  }

  afterCloneFrom(prevNode: this): void {
    super.afterCloneFrom(prevNode);
    this.__markdownSourcePrefix = prevNode.__markdownSourcePrefix;
  }

  setMarkdownSourcePrefix(markdownSourcePrefix: string | null): this {
    if (this.getLatest().__markdownSourcePrefix === markdownSourcePrefix) {
      return this;
    }

    const self = this.getWritable();
    self.__markdownSourcePrefix = markdownSourcePrefix;
    return self;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = super.createDOM(config);
    updateMarkdownSourceDOM(element, this.__markdownSourcePrefix, {
      textLikeMarker: true,
    });
    return element;
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    const shouldReplace = super.updateDOM(prevNode, dom, config);
    if (shouldReplace) {
      return true;
    }

    if (prevNode.__markdownSourcePrefix !== this.__markdownSourcePrefix) {
      updateMarkdownSourceDOM(dom, this.__markdownSourcePrefix, {
        textLikeMarker: true,
      });
    }

    return false;
  }

  exportJSON(): SerializedHeadingNode {
    return {
      ...super.exportJSON(),
      type: "markdown-heading",
    };
  }

  updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedHeadingNode>): this {
    return super.updateFromJSON(serializedNode);
  }
}

export class MarkdownListItemNode extends ListItemNode {
  __markdownSourcePrefix: string | null;

  static getType(): string {
    return "markdown-listitem";
  }

  static clone(node: MarkdownListItemNode): MarkdownListItemNode {
    return new MarkdownListItemNode(
      node.__value,
      node.__checked,
      node.__key,
      node.__markdownSourcePrefix,
    );
  }

  static importJSON(serializedNode: SerializedListItemNode): MarkdownListItemNode {
    return new MarkdownListItemNode().updateFromJSON(serializedNode);
  }

  constructor(
    value?: number,
    checked?: boolean,
    key?: NodeKey,
    markdownSourcePrefix: string | null = null,
  ) {
    super(value, checked, key);
    this.__markdownSourcePrefix = markdownSourcePrefix;
  }

  afterCloneFrom(prevNode: this): void {
    super.afterCloneFrom(prevNode);
    this.__markdownSourcePrefix = prevNode.__markdownSourcePrefix;
  }

  setMarkdownSourcePrefix(markdownSourcePrefix: string | null): this {
    if (this.getLatest().__markdownSourcePrefix === markdownSourcePrefix) {
      return this;
    }

    const self = this.getWritable();
    self.__markdownSourcePrefix = markdownSourcePrefix;
    return self;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = super.createDOM(config);
    updateMarkdownSourceDOM(element, this.__markdownSourcePrefix, {
      hideListMarker: true,
    });
    return element;
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    const shouldReplace = super.updateDOM(prevNode, dom, config);
    if (shouldReplace) {
      return true;
    }

    if (prevNode.__markdownSourcePrefix !== this.__markdownSourcePrefix) {
      updateMarkdownSourceDOM(dom, this.__markdownSourcePrefix, {
        hideListMarker: true,
      });
    }

    return false;
  }

  exportJSON(): SerializedListItemNode {
    return {
      ...super.exportJSON(),
      type: "markdown-listitem",
    };
  }

  updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedListItemNode>): this {
    return super.updateFromJSON(serializedNode);
  }
}

export const $isMarkdownHeadingNode = (
  node: LexicalNode | null | undefined,
): node is MarkdownHeadingNode => {
  return node instanceof MarkdownHeadingNode;
};

export const $isMarkdownListItemNode = (
  node: LexicalNode | null | undefined,
): node is MarkdownListItemNode => {
  return node instanceof MarkdownListItemNode;
};

export const getMarkdownListItemPrefix = (listItemNode: ListItemNode): string => {
  const parentNode = listItemNode.getParent();
  const indent = " ".repeat(listItemNode.getIndent() * 4);

  if (!$isListNode(parentNode)) {
    return `${indent}- `;
  }

  const listType = parentNode.getListType();
  if (listType === "number") {
    return `${indent}${listItemNode.getValue()}. `;
  }
  if (listType === "check") {
    return `${indent}- [${listItemNode.getChecked() ? "x" : " "}] `;
  }

  return `${indent}- `;
};

export const getMarkdownHeadingPrefix = (headingNode: HeadingNode): string => {
  return `${"#".repeat(Number(headingNode.getTag().slice(1)))} `;
};
