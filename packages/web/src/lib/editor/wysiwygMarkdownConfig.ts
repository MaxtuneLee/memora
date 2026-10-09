import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $getState,
  $setSelection,
  $isElementNode,
  $setState,
  createEditor,
  createState,
  type EditorState,
  type LexicalNode,
  type LexicalNodeConfig,
} from "lexical";
import { $isCodeNode, CodeHighlightNode, CodeNode } from "@lexical/code";
import { LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  CHECK_LIST,
  TRANSFORMERS,
  type ElementTransformer,
  type MultilineElementTransformer,
} from "@lexical/markdown";
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table";

import { $isCodeFenceNode, CodeFenceNode } from "@/components/editor/lexical/CodeFenceNode";
import { ImageNode } from "@/components/editor/lexical/ImageNode";
import {
  $isMathNode,
  MathNode,
  getMathNodeSourceText,
  mathTextFormatState,
} from "@/components/editor/lexical/MathNode";
import { MarkdownLinkNode } from "@/components/editor/lexical/MarkdownLinkNode";
import {
  $createDiffHunkNode,
  $isDiffHunkNode,
  DiffHunkNode,
} from "@/components/editor/lexical/DiffHunkNode";
import {
  $createRawMarkdownNode,
  $isRawMarkdownNode,
  RawMarkdownNode,
} from "@/components/editor/lexical/RawMarkdownNode";
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
  setTableCellTransformers,
} from "@/components/editor/lexical/imageMarkdownTransformer";
import {
  LEXICAL_LIST_INDENT_WIDTH,
  normalizeMarkdownListIndent,
  restoreMarkdownListIndent,
} from "@/lib/editor/markdownListIndent";

const isDefaultLinkTransformer = (transformer: (typeof TRANSFORMERS)[number]): boolean => {
  const dependencies = "dependencies" in transformer ? transformer.dependencies : undefined;
  return dependencies?.some((dependency) => dependency === LinkNode) === true;
};

const DEFAULT_WYSIWYG_TRANSFORMERS = TRANSFORMERS.filter((transformer) => {
  return !isDefaultLinkTransformer(transformer);
});

// Lexical only reads a lowercase "x" as checked, so "- [X] done" would come back unchecked.
export const TASK_LIST_TRANSFORMER: ElementTransformer = {
  ...CHECK_LIST,
  replace: (parentNode, children, match, isImport) => {
    const normalizedMatch = match.map((value, index) =>
      index === 3 ? value?.toLowerCase() : value,
    );
    return CHECK_LIST.replace(parentNode, children, normalizedMatch, isImport);
  },
};

const listIndentWidthState = createState("markdownListIndentWidth", {
  parse: (value: unknown): number => {
    return typeof value === "number" && Number.isInteger(value) && value > 0
      ? value
      : LEXICAL_LIST_INDENT_WIDTH;
  },
});

// YAML front matter is kept as-is outside the editable content. It must start with a "key:" line
// and have no blank lines, so a note that opens with a "---" rule is not mistaken for it.
const FRONT_MATTER_REGEXP =
  /^---[ \t]*\r?\n[\w"'-][^\r\n]*:[^\r\n]*\r?\n(?:[^\r\n]*\S[^\r\n]*\r?\n)*?(?:---|\.\.\.)[ \t]*(?:\r?\n[ \t]*)*(?:\r?\n|$)/;

const frontMatterState = createState("markdownFrontMatter", {
  parse: (value: unknown): string => (typeof value === "string" ? value : ""),
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

// Private-use characters that cannot appear in a note mark the lines kept as editable Markdown.
export const RAW_MARKDOWN_START = "\uE010";
export const RAW_MARKDOWN_END = "\uE011";

const RAW_MARKDOWN_TRANSFORMER: MultilineElementTransformer = {
  dependencies: [RawMarkdownNode],
  export: (node: LexicalNode) => {
    return $isRawMarkdownNode(node) ? node.getText() : null;
  },
  regExpEnd: new RegExp(`^${RAW_MARKDOWN_END}$`),
  regExpStart: new RegExp(`^${RAW_MARKDOWN_START}$`),
  replace: (rootNode, _children, _startMatch, _endMatch, linesInBetween) => {
    // The first and last entries are what follows and precedes the markers on their own lines.
    rootNode.append($createRawMarkdownNode((linesInBetween ?? []).slice(1, -1).join("\n")));
  },
  type: "multiline-element",
};

// Mark a change from chat in a note under review; the line between them is the change's index.
export const DIFF_HUNK_START = "\uE012";
export const DIFF_HUNK_END = "\uE013";

const DIFF_HUNK_TRANSFORMER: MultilineElementTransformer = {
  dependencies: [DiffHunkNode],
  export: (node: LexicalNode) => {
    return $isDiffHunkNode(node)
      ? `${DIFF_HUNK_START}\n${node.getHunkIndex()}\n${DIFF_HUNK_END}`
      : null;
  },
  regExpEnd: new RegExp(`^${DIFF_HUNK_END}$`),
  regExpStart: new RegExp(`^${DIFF_HUNK_START}$`),
  replace: (rootNode, _children, _startMatch, _endMatch, linesInBetween) => {
    const index = Number((linesInBetween ?? []).slice(1, -1).join(""));
    if (Number.isInteger(index)) {
      rootNode.append($createDiffHunkNode(index));
    }
  },
  type: "multiline-element",
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
  DiffHunkNode,
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
  RawMarkdownNode,
  TableCellNode,
  TableNode,
  TableRowNode,
];

export const WYSIWYG_TRANSFORMERS = [
  RAW_MARKDOWN_TRANSFORMER,
  CODE_FENCE_MARKDOWN_TRANSFORMER,
  CODE_BLOCK_WITH_FENCES_TRANSFORMER,
  HORIZONTAL_RULE_TRANSFORMER,
  MULTILINE_MATH_BLOCK_TRANSFORMER,
  MATH_BLOCK_TRANSFORMER,
  TASK_LIST_TRANSFORMER,
  TABLE_TRANSFORMER,
  SETEXT_HEADING_TRANSFORMER,
  HTML_IMAGE_TRANSFORMER,
  LINKED_IMAGE_TRANSFORMER,
  IMAGE_TRANSFORMER,
  INLINE_MATH_TRANSFORMER,
  HTML_ANCHOR_TRANSFORMER,
  MARKDOWN_LINK_TRANSFORMER,
  DIFF_HUNK_TRANSFORMER,
  ...DEFAULT_WYSIWYG_TRANSFORMERS,
];

setTableCellTransformers(WYSIWYG_TRANSFORMERS);

export const importWysiwygMarkdown = (markdown: string): void => {
  const frontMatter = markdown.match(FRONT_MATTER_REGEXP)?.[0] ?? "";
  const { indentWidth, markdown: normalizedMarkdown } = normalizeMarkdownListIndent(
    markdown.slice(frontMatter.length),
  );
  const root = $getRoot();
  $convertFromMarkdownString(normalizedMarkdown, WYSIWYG_TRANSFORMERS, root);
  $setState(root, listIndentWidthState, indentWidth);
  $setState(root, frontMatterState, frontMatter);
};

const $collectFormattedInlineMath = (node: LexicalNode, found: MathNode[] = []): MathNode[] => {
  if ($isMathNode(node) && !node.getDisplayMode() && $getState(node, mathTextFormatState) !== 0) {
    found.push(node);
  } else if ($isElementNode(node)) {
    for (const child of node.getChildren()) {
      $collectFormattedInlineMath(child, found);
    }
  }
  return found;
};

const inlineMathPlaceholder = (index: number): string => `\uE000${index}\uE001`;
const INLINE_MATH_PLACEHOLDER_REGEXP = /\uE000(\d+)\uE001/g;

// Lexical closes "**" before any node that is not text, so formatted inline formulas are
// exported as formatted placeholder text and swapped back afterwards.
const exportWithFormattedInlineMath = (editorState: EditorState): string | null => {
  const hasFormattedMath = editorState.read(
    () => $collectFormattedInlineMath($getRoot()).length > 0,
  );
  if (!hasFormattedMath) {
    return null;
  }

  const exportEditor = createEditor({
    nodes: WYSIWYG_NODES,
    onError: (error) => {
      throw error;
    },
  });
  exportEditor.setEditorState(exportEditor.parseEditorState(editorState.toJSON()));
  const formulas: string[] = [];
  exportEditor.update(
    () => {
      for (const mathNode of $collectFormattedInlineMath($getRoot())) {
        formulas.push(getMathNodeSourceText(mathNode.getFormula(), mathNode.getInlineDelimiter()));
        const placeholder = $createTextNode(inlineMathPlaceholder(formulas.length - 1));
        placeholder.setFormat($getState(mathNode, mathTextFormatState));
        mathNode.replace(placeholder);
      }
    },
    { discrete: true },
  );
  return exportEditor
    .getEditorState()
    .read(() => $convertToMarkdownString(WYSIWYG_TRANSFORMERS))
    .replace(INLINE_MATH_PLACEHOLDER_REGEXP, (_, index: string) => formulas[Number(index)] ?? "");
};

export const exportWysiwygMarkdown = (editorState: EditorState): string => {
  const markdownWithFormattedMath = exportWithFormattedInlineMath(editorState);
  return editorState.read(() => {
    const markdown = (markdownWithFormattedMath ?? $convertToMarkdownString(WYSIWYG_TRANSFORMERS))
      .replaceAll(`${CODE_FENCE_EXPORT_SENTINEL}\n\n`, "")
      .replaceAll(`\n\n${CODE_FENCE_EXPORT_SENTINEL}`, "")
      .replaceAll(CODE_FENCE_EXPORT_SENTINEL, "");
    const root = $getRoot();
    const body = restoreMarkdownListIndent(markdown, $getState(root, listIndentWidthState));
    return `${$getState(root, frontMatterState)}${body}`;
  });
};

// Converts pasted markdown into editor nodes without touching the current document.
export const $createNodesFromMarkdown = (markdown: string): LexicalNode[] => {
  const selection = $getSelection()?.clone() ?? null;
  const container = $createParagraphNode();
  $convertFromMarkdownString(
    normalizeMarkdownListIndent(markdown).markdown,
    WYSIWYG_TRANSFORMERS,
    container,
  );
  // The markdown import moves the caret into the container; put it back.
  $setSelection(selection);
  return container.getChildren();
};
