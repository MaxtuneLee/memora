import type { JSX, MouseEvent } from "react";
import type {
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import { $createNodeSelection, $setSelection, DecoratorNode } from "lexical";

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
    container.className = "my-4";
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
      <figure
        className="my-4 inline-block max-w-full overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 align-top"
        onClick={handleClick}
      >
        <img
          src={this.__src}
          alt={this.__altText}
          className="block h-auto max-h-[28rem] max-w-full object-contain"
        />
        {this.__altText ? (
          <figcaption className="border-t border-zinc-200 px-3 py-2 text-sm text-zinc-500">
            {this.__altText}
          </figcaption>
        ) : null}
      </figure>
    );

    const imageContent = this.__href ? (
      <a
        href={this.__href}
        className="inline-block max-w-full text-[var(--color-memora-olive)]"
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
      <div className="my-4 flex max-w-full flex-col items-start gap-2">
        <code className="max-w-full overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-sm text-zinc-900">
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
