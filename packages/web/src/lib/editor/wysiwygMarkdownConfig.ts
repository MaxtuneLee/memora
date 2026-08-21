import { $getRoot, type EditorState, type LexicalNode, type LexicalNodeConfig } from "lexical";
import { $isCodeNode, CodeHighlightNode, CodeNode } from "@lexical/code";
import { LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  CHECK_LIST,
  TRANSFORMERS,
  type ElementTransformer,
} from "@lexical/markdown";
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table";

import { $isCodeFenceNode, CodeFenceNode } from "@/components/editor/lexical/CodeFenceNode";
import { ImageNode } from "@/components/editor/lexical/ImageNode";
import { MathNode } from "@/components/editor/lexical/MathNode";
import { MarkdownLinkNode } from "@/components/editor/lexical/MarkdownLinkNode";
import {
  MarkdownHeadingNode,
  MarkdownListItemNode,
} from "@/components/editor/lexical/MarkdownSourceNodes";
import {
  HTML_ANCHOR_TRANSFORMER,
  HTML_IMAGE_TRANSFORMER,
  HORIZONTAL_RULE_TRANSFORMER,
  IMAGE_TRANSFORMER,
  INLINE_MATH_TRANSFORMER,
  LINKED_IMAGE_TRANSFORMER,
  MARKDOWN_LINK_TRANSFORMER,
  MATH_BLOCK_TRANSFORMER,
  MULTILINE_MATH_BLOCK_TRANSFORMER,
  SETEXT_HEADING_TRANSFORMER,
  TABLE_TRANSFORMER,
} from "@/components/editor/lexical/imageMarkdownTransformer";

const isDefaultLinkTransformer = (transformer: (typeof TRANSFORMERS)[number]): boolean => {
  const dependencies = "dependencies" in transformer ? transformer.dependencies : undefined;
  return dependencies?.some((dependency) => dependency === LinkNode) === true;
};

const DEFAULT_WYSIWYG_TRANSFORMERS = TRANSFORMERS.filter((transformer) => {
  return !isDefaultLinkTransformer(transformer);
});

const CODE_FENCE_EXPORT_SENTINEL = "__MEMORA_CODE_FENCE__";

const CODE_FENCE_MARKDOWN_TRANSFORMER: ElementTransformer = {
  dependencies: [CodeFenceNode],
  export: (node: LexicalNode) => {
    return $isCodeFenceNode(node) ? CODE_FENCE_EXPORT_SENTINEL : null;
  },
  regExp: /a^/,
  replace: () => false,
  type: "element",
};

const CODE_BLOCK_WITH_FENCES_TRANSFORMER: ElementTransformer = {
  dependencies: [CodeNode],
  export: (node: LexicalNode) => {
    if (!$isCodeNode(node)) {
      return null;
    }

    const previousSibling = node.getPreviousSibling();
    const nextSibling = node.getNextSibling();
    const openingFence =
      $isCodeFenceNode(previousSibling) && previousSibling.getRole() === "open"
        ? previousSibling.getTextContent()
        : `\`\`\`${node.getLanguage() ?? ""}`;
    const closingFence =
      $isCodeFenceNode(nextSibling) && nextSibling.getRole() === "close"
        ? nextSibling.getTextContent()
        : "```";

    return `${openingFence}\n${node.getTextContent()}\n${closingFence}`;
  },
  regExp: /a^/,
  replace: () => false,
  type: "element",
};

const markdownLinkReplacement = {
  replace: LinkNode,
  with: (node: LinkNode) => {
    return new MarkdownLinkNode(node.getURL(), {
      rel: node.getRel(),
      target: node.getTarget(),
      title: node.getTitle(),
    });
  },
  withKlass: MarkdownLinkNode,
};

export const WYSIWYG_NODES: ReadonlyArray<LexicalNodeConfig> = [
  CodeFenceNode,
  CodeHighlightNode,
  CodeNode,
  HorizontalRuleNode,
  HeadingNode,
  MarkdownHeadingNode,
  ImageNode,
  MarkdownLinkNode,
  markdownLinkReplacement,
  ListNode,
  ListItemNode,
  MarkdownListItemNode,
  MathNode,
  QuoteNode,
  TableCellNode,
  TableNode,
  TableRowNode,
];

export const WYSIWYG_TRANSFORMERS = [
  CODE_FENCE_MARKDOWN_TRANSFORMER,
  CODE_BLOCK_WITH_FENCES_TRANSFORMER,
  HORIZONTAL_RULE_TRANSFORMER,
  MULTILINE_MATH_BLOCK_TRANSFORMER,
  MATH_BLOCK_TRANSFORMER,
  CHECK_LIST,
  TABLE_TRANSFORMER,
  SETEXT_HEADING_TRANSFORMER,
  HTML_IMAGE_TRANSFORMER,
  LINKED_IMAGE_TRANSFORMER,
  IMAGE_TRANSFORMER,
  INLINE_MATH_TRANSFORMER,
  HTML_ANCHOR_TRANSFORMER,
  MARKDOWN_LINK_TRANSFORMER,
  ...DEFAULT_WYSIWYG_TRANSFORMERS,
];

export const importWysiwygMarkdown = (markdown: string): void => {
  $convertFromMarkdownString(markdown, WYSIWYG_TRANSFORMERS, $getRoot());
};

export const exportWysiwygMarkdown = (editorState: EditorState): string => {
  return editorState
    .read(() => $convertToMarkdownString(WYSIWYG_TRANSFORMERS))
    .replaceAll(`${CODE_FENCE_EXPORT_SENTINEL}\n\n`, "")
    .replaceAll(`\n\n${CODE_FENCE_EXPORT_SENTINEL}`, "")
    .replaceAll(CODE_FENCE_EXPORT_SENTINEL, "");
};
