import type {
  DOMConversionMap,
  DOMConversionOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  Spread,
} from "lexical";
import { LinkNode, type LinkAttributes, type SerializedLinkNode } from "@lexical/link";

const MARKDOWN_LINK_PREFIX_ATTR = "data-markdown-link-prefix";
const MARKDOWN_LINK_SUFFIX_ATTR = "data-markdown-link-suffix";

const getLinkMarker = (element: HTMLElement, attributeName: string): HTMLSpanElement | null => {
  for (const child of element.childNodes) {
    const childElement = child instanceof HTMLElement ? child : null;
    if (childElement?.tagName === "SPAN" && childElement.getAttribute(attributeName) === "true") {
      return childElement as HTMLSpanElement;
    }
  }

  return null;
};

const getMarkdownLinkSuffixText = (url: string, title: string | null): string => {
  return `](${url}${title ? ` "${title.replace(/([\\"])/g, "\\$1")}"` : ""})`;
};

const updateMarkdownLinkDOM = (
  element: HTMLElement,
  url: string,
  title: string | null,
  isActive: boolean,
): void => {
  const existingPrefix = getLinkMarker(element, MARKDOWN_LINK_PREFIX_ATTR);
  const existingSuffix = getLinkMarker(element, MARKDOWN_LINK_SUFFIX_ATTR);

  if (!isActive) {
    existingPrefix?.remove();
    existingSuffix?.remove();
    element.removeAttribute("data-active-markdown-source");
    element.style.color = "";
    return;
  }

  const prefix = existingPrefix ?? document.createElement("span");
  prefix.setAttribute(MARKDOWN_LINK_PREFIX_ATTR, "true");
  prefix.contentEditable = "false";
  prefix.textContent = "[";
  prefix.style.color = "var(--color-memora-text-soft)";
  prefix.style.font = "inherit";
  prefix.style.letterSpacing = "inherit";
  prefix.style.lineHeight = "inherit";
  prefix.style.textDecoration = "none";
  prefix.style.pointerEvents = "none";
  prefix.style.userSelect = "none";
  prefix.style.whiteSpace = "pre";

  const suffix = existingSuffix ?? document.createElement("span");
  suffix.setAttribute(MARKDOWN_LINK_SUFFIX_ATTR, "true");
  suffix.contentEditable = "false";
  suffix.textContent = getMarkdownLinkSuffixText(url, title);
  suffix.style.color = "var(--color-memora-text-muted)";
  suffix.style.font = "inherit";
  suffix.style.letterSpacing = "inherit";
  suffix.style.lineHeight = "inherit";
  suffix.style.textDecoration = "none";
  suffix.style.pointerEvents = "none";
  suffix.style.userSelect = "none";
  suffix.style.whiteSpace = "pre";

  if (!existingPrefix) {
    element.insertBefore(prefix, element.firstChild);
  }
  if (!existingSuffix) {
    element.append(suffix);
  }

  element.setAttribute("data-active-markdown-source", "true");
  element.style.color = "var(--color-memora-accent)";
};

export type SerializedMarkdownLinkNode = Spread<
  {
    type: "markdown-link";
  },
  SerializedLinkNode
>;

const convertAnchorElement = (domNode: Node): DOMConversionOutput => {
  let node = null;
  if (
    domNode instanceof HTMLAnchorElement &&
    (domNode.textContent || domNode.children.length > 0)
  ) {
    node = $createMarkdownLinkNode(domNode.getAttribute("href") ?? "", {
      rel: domNode.getAttribute("rel"),
      target: domNode.getAttribute("target"),
      title: domNode.getAttribute("title"),
    });
  }

  return { node };
};

export class MarkdownLinkNode extends LinkNode {
  __markdownSourceActive: boolean;

  static getType(): string {
    return "markdown-link";
  }

  static clone(node: MarkdownLinkNode): MarkdownLinkNode {
    const clone = new MarkdownLinkNode(
      node.__url,
      {
        rel: node.__rel,
        target: node.__target,
        title: node.__title,
      },
      node.__key,
    );
    clone.__markdownSourceActive = node.__markdownSourceActive;
    return clone;
  }

  static importJSON(serializedNode: SerializedMarkdownLinkNode): MarkdownLinkNode {
    return new MarkdownLinkNode().updateFromJSON(serializedNode);
  }

  static importDOM(): DOMConversionMap | null {
    return {
      a: () => ({
        conversion: convertAnchorElement,
        priority: 1,
      }),
    };
  }

  constructor(url = "", attributes: LinkAttributes = {}, key?: NodeKey) {
    super(url, attributes, key);
    this.__markdownSourceActive = false;
  }

  afterCloneFrom(prevNode: this): void {
    super.afterCloneFrom(prevNode);
    this.__markdownSourceActive = prevNode.__markdownSourceActive;
  }

  setMarkdownSourceActive(isActive: boolean): this {
    if (this.getLatest().__markdownSourceActive === isActive) {
      return this;
    }

    const self = this.getWritable();
    self.__markdownSourceActive = isActive;
    return self;
  }

  isMarkdownSourceActive(): boolean {
    return this.getLatest().__markdownSourceActive;
  }

  createDOM(config: EditorConfig): HTMLAnchorElement | HTMLSpanElement {
    const element = super.createDOM(config);
    updateMarkdownLinkDOM(element, this.getURL(), this.getTitle(), this.__markdownSourceActive);
    return element;
  }

  updateDOM(
    prevNode: this,
    anchor: HTMLAnchorElement | HTMLSpanElement,
    config: EditorConfig,
  ): boolean {
    const shouldReplace = super.updateDOM(prevNode, anchor, config);
    if (shouldReplace) {
      return true;
    }

    if (
      prevNode.__markdownSourceActive !== this.__markdownSourceActive ||
      prevNode.__url !== this.__url ||
      prevNode.__title !== this.__title
    ) {
      updateMarkdownLinkDOM(anchor, this.getURL(), this.getTitle(), this.__markdownSourceActive);
    }

    return false;
  }

  exportJSON(): SerializedMarkdownLinkNode {
    return {
      ...super.exportJSON(),
      type: "markdown-link",
    };
  }
}

export const $createMarkdownLinkNode = (
  url = "",
  attributes: LinkAttributes = {},
): MarkdownLinkNode => {
  return new MarkdownLinkNode(url, attributes);
};

export const $isMarkdownLinkNode = (
  node: LexicalNode | null | undefined,
): node is MarkdownLinkNode => {
  return node instanceof MarkdownLinkNode;
};
