import type { JSX, MouseEvent } from "react";
import * as stylex from "@stylexjs/stylex";
import type {
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import { $createNodeSelection, $setSelection, DecoratorNode } from "lexical";

const styles = stylex.create({
  container: { marginBlock: 16 },
  figure: {
    backgroundColor: "#fafafa",
    borderColor: "#e4e4e7",
    borderRadius: 16,
    borderStyle: "solid",
    borderWidth: 1,
    display: "inline-block",
    marginBlock: 16,
    maxWidth: "100%",
    overflow: "hidden",
    verticalAlign: "top",
  },
  image: {
    display: "block",
    height: "auto",
    maxHeight: "28rem",
    maxWidth: "100%",
    objectFit: "contain",
  },
  caption: {
    borderTop: "1px solid #e4e4e7",
    color: "#71717a",
    fontSize: "0.875rem",
    paddingBlock: 8,
    paddingInline: 12,
  },
  link: { color: "var(--color-memora-olive)", display: "inline-block", maxWidth: "100%" },
  source: {
    alignItems: "flex-start",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginBlock: 16,
    maxWidth: "100%",
  },
  sourceCode: {
    backgroundColor: "#fafafa",
    borderColor: "#e4e4e7",
    borderRadius: 8,
    borderStyle: "solid",
    borderWidth: 1,
    color: "#18181b",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace",
    fontSize: "0.875rem",
    maxWidth: "100%",
    overflowX: "auto",
    paddingBlock: 8,
    paddingInline: 12,
  },
});

const containerClassName = stylex.props(styles.container).className ?? "";

const escapeImageMarkdownAltText = (text: string): string => {
  return text.replace(/([\\[\]])/g, "\\$1");
};

export const getImageNodeSourceText = (
  altText: string,
  src: string,
  href: string | null,
): string => {
  const imageSource = `![${escapeImageMarkdownAltText(altText)}](${src})`;
  return href ? `[${imageSource}](${href})` : imageSource;
};

export type SerializedImageNode = Spread<
  {
    altText: string;
    href?: string | null;
    src: string;
    type: "image";
    version: 1;
  },
  SerializedLexicalNode
>;

export class ImageNode extends DecoratorNode<JSX.Element> {
  __src: string;
  __altText: string;
  __href: string | null;
  __markdownSourceActive: boolean;

  static getType(): string {
    return "image";
  }

  static clone(node: ImageNode): ImageNode {
    const clone = new ImageNode(node.__src, node.__altText, node.__href, node.__key);
    clone.__markdownSourceActive = node.__markdownSourceActive;
    return clone;
  }

  static importJSON(serializedNode: SerializedImageNode): ImageNode {
    return new ImageNode(serializedNode.src, serializedNode.altText, serializedNode.href ?? null);
  }

  constructor(src: string, altText = "", href: string | null = null, key?: NodeKey) {
    super(key);
    this.__src = src;
    this.__altText = altText;
    this.__href = href;
    this.__markdownSourceActive = false;
  }

  exportJSON(): SerializedImageNode {
    return {
      ...super.exportJSON(),
      altText: this.__altText,
      href: this.__href,
      src: this.__src,
      type: "image",
      version: 1,
    };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const container = document.createElement("div");
    container.className = containerClassName;
    return container;
  }

  updateDOM(): false {
    return false;
  }

  getSrc(): string {
    return this.__src;
  }

  getAltText(): string {
    return this.__altText;
  }

  getHref(): string | null {
    return this.__href;
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
    return getImageNodeSourceText(this.__altText, this.__src, this.__href);
  }

  decorate(editor: LexicalEditor, _config: EditorConfig): JSX.Element {
    const handleClick = (event: MouseEvent): void => {
      event.preventDefault();
      event.stopPropagation();
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

    const figure = (
      <figure {...stylex.props(styles.figure)} onClick={handleClick}>
        <img src={this.__src} alt={this.__altText} {...stylex.props(styles.image)} />
        {this.__altText ? (
          <figcaption {...stylex.props(styles.caption)}>{this.__altText}</figcaption>
        ) : null}
      </figure>
    );

    const imageContent = this.__href ? (
      <a
        href={this.__href}
        {...stylex.props(styles.link)}
        target="_blank"
        rel="noreferrer"
        onClick={handleClick}
      >
        {figure}
      </a>
    ) : (
      figure
    );

    if (!this.__markdownSourceActive) {
      return imageContent;
    }

    return (
      <div {...stylex.props(styles.source)}>
        <code {...stylex.props(styles.sourceCode)}>
          {getImageNodeSourceText(this.__altText, this.__src, this.__href)}
        </code>
        {imageContent}
      </div>
    );
  }
}

export const $createImageNode = (
  src: string,
  altText = "",
  href: string | null = null,
): ImageNode => {
  return new ImageNode(src, altText, href);
};

export const $isImageNode = (node: LexicalNode | null | undefined): node is ImageNode => {
  return node instanceof ImageNode;
};
