import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type MutableRefObject,
} from "react";
import "katex/dist/katex.min.css";
import {
  $getSelection,
  $getRoot,
  $getNodeByKey,
  $createParagraphNode,
  $createTextNode,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  $isTextNode,
  HISTORIC_TAG,
  IS_BOLD,
  IS_CODE,
  IS_ITALIC,
  IS_STRIKETHROUGH,
  COMMAND_PRIORITY_CRITICAL,
  HISTORY_MERGE_TAG,
  KEY_BACKSPACE_COMMAND,
  KEY_DOWN_COMMAND,
  SELECTION_CHANGE_COMMAND,
  mergeRegister,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from "lexical";
import { ListItemNode } from "@lexical/list";
import { $isCodeNode, registerCodeHighlighting } from "@lexical/code";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin";
import { HorizontalRulePlugin } from "@lexical/react/LexicalHorizontalRulePlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { TablePlugin } from "@lexical/react/LexicalTablePlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { CodeNode } from "@lexical/code";
import {
  $createQuoteNode,
  $isQuoteNode,
  HeadingNode,
  QuoteNode,
  type HeadingTagType,
} from "@lexical/rich-text";
import { INSERT_TABLE_COMMAND } from "@lexical/table";

import {
  ImageNode,
  $isImageNode,
  getImageNodeSourceText,
} from "@/components/editor/lexical/ImageNode";
import { MathNode, $isMathNode } from "@/components/editor/lexical/MathNode";
import {
  $isMarkdownLinkNode,
  MarkdownLinkNode,
} from "@/components/editor/lexical/MarkdownLinkNode";
import {
  $isMarkdownHeadingNode,
  $isMarkdownListItemNode,
  MarkdownHeadingNode,
  MarkdownListItemNode,
  getMarkdownHeadingPrefix,
  getMarkdownListItemPrefix,
} from "@/components/editor/lexical/MarkdownSourceNodes";
import {
  $createCodeFenceNode,
  $isCodeFenceNode,
  CodeFenceNode,
} from "@/components/editor/lexical/CodeFenceNode";
import {
  parseInlineMath,
  parseMarkdownImage,
  parseMarkdownLink,
  parseMarkdownLinkedImage,
  parseMathBlock,
} from "@/components/editor/lexical/imageMarkdownTransformer";
import { WysiwygFormattingToolbar } from "@/components/editor/WysiwygFormattingToolbar";
import { MathEditorPopover } from "@/components/editor/MathEditorPopover";
import { SlashCommandPlugin } from "@/components/editor/SlashCommandPlugin";
import { normalizeMarkdownRoundTripText } from "@/lib/editor/markdownRoundTripGuard";
import {
  WYSIWYG_NODES,
  WYSIWYG_TRANSFORMERS,
  exportWysiwygMarkdown,
  importWysiwygMarkdown,
} from "@/lib/editor/wysiwygMarkdownConfig";

export interface WysiwygDocumentEditorHandle {
  insertTable: () => void;
  revealHeading: (headingIndex: number) => void;
}

interface WysiwygDocumentEditorProps {
  text: string;
  onActiveHeadingChange?: (headingIndex: number) => void;
  onTextChange: (text: string) => void;
}

const PLACEHOLDER = "Start writing...";
const CODE_BLOCK_WITH_FENCES_STYLE =
  "margin-top: 0; margin-bottom: 0; border-radius: 0; padding-top: 0.25rem; padding-bottom: 0.25rem;";

const EDITABLE_LINK_LABEL_SOURCE_STYLE =
  "color: var(--color-memora-accent); text-decoration-line: underline; text-decoration-color: color-mix(in srgb, var(--color-memora-accent) 58%, transparent); text-underline-offset: 2px;";
const EDITABLE_LINK_MARKER_SOURCE_STYLE = "color: var(--color-memora-text-muted);";

const theme = {
  code: "my-4 block overflow-x-auto rounded-xl bg-zinc-50 px-4 py-3 font-mono text-sm leading-6 text-zinc-900",
  heading: {
    h1: "mb-4 scroll-mt-4 text-4xl font-semibold tracking-[-0.03em] text-zinc-950",
    h2: "mb-3 mt-8 scroll-mt-4 text-2xl font-semibold tracking-[-0.02em] text-zinc-900",
    h3: "mb-3 mt-6 scroll-mt-4 text-xl font-semibold text-zinc-900",
    h4: "mb-2 mt-5 scroll-mt-4 text-lg font-semibold text-zinc-900",
    h5: "mb-2 mt-4 scroll-mt-4 text-base font-semibold text-zinc-900",
    h6: "mb-2 mt-4 scroll-mt-4 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-600",
  },
  image: "my-4",
  hr: "my-6 border-0 border-t border-zinc-200",
  link: "text-[var(--color-memora-olive)] underline decoration-[color-mix(in_srgb,var(--color-memora-olive)_58%,transparent)] underline-offset-2",
  list: {
    checklist: "my-4 ml-6 list-none space-y-2",
    listitem: "my-1 leading-7 text-zinc-900",
    listitemChecked:
      "relative list-none pl-7 text-zinc-500 line-through before:absolute before:left-0 before:top-1.5 before:flex before:h-5 before:w-5 before:items-center before:justify-center before:rounded-md before:border before:border-zinc-300 before:bg-zinc-900 before:text-[11px] before:text-white before:content-['✓']",
    listitemUnchecked:
      "relative list-none pl-7 text-zinc-900 before:absolute before:left-0 before:top-1.5 before:h-5 before:w-5 before:rounded-md before:border before:border-zinc-300 before:bg-white before:content-['']",
    nested: {
      list: "mt-2",
      listitem: "my-1",
    },
    ol: "my-4 ml-6 list-decimal space-y-2 marker:text-zinc-400",
    ul: "my-4 ml-6 list-disc space-y-2 marker:text-zinc-400",
  },
  paragraph: "mb-3 leading-7 text-zinc-900",
  quote: "border-l-2 border-zinc-300 pl-4 italic text-zinc-600",
  root: "relative min-h-[420px] px-0 py-0",
  table: "w-full border-collapse text-sm",
  tableCell: "border border-zinc-200 px-3 py-2 align-top",
  tableCellHeader:
    "border border-zinc-200 bg-zinc-50 px-3 py-2 align-top font-semibold text-zinc-900",
  tableRow: "align-top",
  tableScrollableWrapper: "overflow-x-auto",
  text: {
    bold: "font-semibold",
    code: "rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[0.92em]",
    italic: "italic",
    strikethrough: "line-through",
    underline: "underline",
  },
};

const escapeMarkdownLinkText = (text: string): string => {
  return text.replace(/([\\[\]])/g, "\\$1");
};

const escapeMarkdownLinkTitle = (text: string): string => {
  return text.replace(/([\\"])/g, "\\$1");
};

export const getEscapedMarkdownLinkTextOffset = (text: string, offset: number): number => {
  return escapeMarkdownLinkText(text.slice(0, offset)).length;
};

export const getMarkdownLinkLabelOffsetFromSourceOffset = (
  sourceText: string,
  sourceOffset: number,
): number => {
  if (!sourceText.startsWith("[")) {
    return 0;
  }

  let labelOffset = 0;
  for (let index = 1; index < sourceText.length; index += 1) {
    if (index >= sourceOffset) {
      return labelOffset;
    }

    const currentChar = sourceText[index];
    if (currentChar === "\\") {
      if (index + 1 >= sourceText.length) {
        return labelOffset;
      }
      if (index + 1 >= sourceOffset) {
        return labelOffset;
      }
      labelOffset += 1;
      index += 1;
      continue;
    }

    if (currentChar === "]") {
      return labelOffset;
    }

    labelOffset += 1;
  }

  return labelOffset;
};

type EditableFormattedTextKind = "bold" | "bold-italic" | "code" | "italic" | "strikethrough";

interface ParsedFormattedTextSource {
  markerLength: number;
  prefix: string;
  suffix: string;
  text: string;
}

const getInlineCodeFence = (text: string): string => {
  const backtickRuns = text.match(/`+/g) ?? [];
  const fenceLength = Math.max(1, ...backtickRuns.map((run) => run.length + 1));
  return "`".repeat(fenceLength);
};

export const getFormattedTextSourceText = (
  kind: EditableFormattedTextKind,
  text: string,
): string => {
  if (kind === "code") {
    const fence = getInlineCodeFence(text);
    return `${fence}${text}${fence}`;
  }

  if (kind === "bold") {
    return `**${text}**`;
  }

  if (kind === "bold-italic") {
    return `***${text}***`;
  }

  if (kind === "italic") {
    return `*${text}*`;
  }

  return `~~${text}~~`;
};

const getFormattedTextMarkerLength = (kind: EditableFormattedTextKind, text: string): number => {
  if (kind === "code") {
    return getInlineCodeFence(text).length;
  }

  if (kind === "bold-italic") {
    return 3;
  }

  return kind === "bold" || kind === "strikethrough" ? 2 : 1;
};

export const getFormattedTextLabelOffsetFromSourceOffset = (
  sourceText: string,
  sourceOffset: number,
  kind: EditableFormattedTextKind,
): number => {
  const parsedSource = parseFormattedTextSourceText(kind, sourceText);
  if (parsedSource) {
    const contentOffset = sourceOffset - parsedSource.prefix.length - parsedSource.markerLength;
    return Math.min(Math.max(contentOffset, 0), parsedSource.text.length);
  }

  const markerLength = getFormattedTextMarkerLength(kind, sourceText);
  const contentLength = Math.max(sourceText.length - markerLength * 2, 0);
  return Math.min(Math.max(sourceOffset - markerLength, 0), contentLength);
};

const getFormattedTextSourceOffsetFromLabelOffset = (
  kind: EditableFormattedTextKind,
  text: string,
  labelOffset: number | null,
): number => {
  const markerLength = getFormattedTextMarkerLength(kind, text);
  return markerLength + Math.min(Math.max(labelOffset ?? 0, 0), text.length);
};

const parseFormattedTextSourceText = (
  kind: EditableFormattedTextKind,
  sourceText: string,
): ParsedFormattedTextSource | null => {
  if (kind === "code") {
    const match = sourceText.match(/^(\s*)(`+)([\s\S]*)\2(\s*)$/);
    return match
      ? {
          markerLength: match[2]?.length ?? 1,
          prefix: match[1] ?? "",
          suffix: match[4] ?? "",
          text: match[3] ?? "",
        }
      : null;
  }

  if (kind === "bold-italic") {
    const match = sourceText.match(/^(\s*)\*\*\*([\s\S]*)\*\*\*(\s*)$/);
    return match
      ? {
          markerLength: 3,
          prefix: match[1] ?? "",
          suffix: match[3] ?? "",
          text: match[2] ?? "",
        }
      : null;
  }

  if (kind === "italic") {
    const match = sourceText.match(/^(\s*)\*([\s\S]*)\*(\s*)$/);
    return match
      ? {
          markerLength: 1,
          prefix: match[1] ?? "",
          suffix: match[3] ?? "",
          text: match[2] ?? "",
        }
      : null;
  }

  if (kind === "bold") {
    const match = sourceText.match(/^(\s*)\*\*([\s\S]*)\*\*(\s*)$/);
    return match
      ? {
          markerLength: 2,
          prefix: match[1] ?? "",
          suffix: match[3] ?? "",
          text: match[2] ?? "",
        }
      : null;
  }

  const match = sourceText.match(/^(\s*)~~([\s\S]*)~~(\s*)$/);
  return match
    ? {
        markerLength: 2,
        prefix: match[1] ?? "",
        suffix: match[3] ?? "",
        text: match[2] ?? "",
      }
    : null;
};

const getFormattedTextKind = (node: LexicalNode): EditableFormattedTextKind | null => {
  if (!$isTextNode(node)) {
    return null;
  }

  if (node.hasFormat("code")) {
    return "code";
  }
  if (node.hasFormat("bold") && node.hasFormat("italic")) {
    return "bold-italic";
  }
  if (node.hasFormat("bold")) {
    return "bold";
  }
  if (node.hasFormat("strikethrough")) {
    return "strikethrough";
  }
  if (node.hasFormat("italic")) {
    return "italic";
  }

  return null;
};

const getFormattedTextFormat = (kind: EditableFormattedTextKind): number => {
  if (kind === "code") {
    return IS_CODE;
  }

  if (kind === "bold-italic") {
    return IS_BOLD | IS_ITALIC;
  }

  if (kind === "bold") {
    return IS_BOLD;
  }

  if (kind === "italic") {
    return IS_ITALIC;
  }

  return IS_STRIKETHROUGH;
};

export const getImageMarkdownSourceText = (
  altText: string,
  src: string,
  href: string | null,
): string => {
  return getImageNodeSourceText(altText, src, href);
};

const getQuoteMarkdownSourceText = (node: QuoteNode): string => {
  return node
    .getTextContent()
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
};

const parseQuoteMarkdownSourceText = (sourceText: string): string | null => {
  const lines = sourceText.split("\n");
  if (!lines.every((line) => /^>\s?/.test(line))) {
    return null;
  }

  return lines.map((line) => line.replace(/^>\s?/, "")).join("\n");
};

const getQuoteSourceOffsetFromContentOffset = (content: string, contentOffset: number): number => {
  let sourceOffset = 0;
  let consumedContent = 0;
  const lines = content.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const lineEnd = consumedContent + line.length;
    if (contentOffset <= lineEnd) {
      return sourceOffset + 2 + (contentOffset - consumedContent);
    }

    sourceOffset += 2 + line.length + 1;
    consumedContent = lineEnd + 1;
  }

  return sourceOffset;
};

const getQuoteContentOffsetFromSourceOffset = (
  sourceText: string,
  sourceOffset: number,
): number => {
  let contentOffset = 0;
  let consumedSource = 0;
  const lines = sourceText.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const contentLine = line.replace(/^>\s?/, "");
    const markerLength = line.length - contentLine.length;
    const lineSourceEnd = consumedSource + line.length;
    if (sourceOffset <= lineSourceEnd) {
      return (
        contentOffset +
        Math.min(Math.max(sourceOffset - consumedSource - markerLength, 0), contentLine.length)
      );
    }

    consumedSource = lineSourceEnd + 1;
    contentOffset += contentLine.length + 1;
  }

  return contentOffset;
};

const getSelectionAnchorNode = (): LexicalNode | null => {
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    return selection.anchor.getNode();
  }

  return null;
};

const findListItemNode = (node: LexicalNode): MarkdownListItemNode | null => {
  let currentNode: LexicalNode | null = node;
  while (currentNode) {
    if ($isMarkdownListItemNode(currentNode)) {
      return currentNode;
    }
    currentNode = currentNode.getParent();
  }

  return null;
};

const getActiveMarkdownSource = (): {
  node: MarkdownHeadingNode | MarkdownListItemNode;
  prefix: string;
} | null => {
  const anchorNode = getSelectionAnchorNode();
  if (!anchorNode) {
    return null;
  }

  const listItemNode = findListItemNode(anchorNode);
  if (listItemNode) {
    return {
      node: listItemNode,
      prefix: getMarkdownListItemPrefix(listItemNode),
    };
  }

  const topLevelElement = anchorNode.getTopLevelElement();
  if (!$isMarkdownHeadingNode(topLevelElement)) {
    return null;
  }

  return {
    node: topLevelElement,
    prefix: getMarkdownHeadingPrefix(topLevelElement),
  };
};

const getActiveMarkdownHeading = (): MarkdownHeadingNode | null => {
  const anchorNode = getSelectionAnchorNode();
  const topLevelElement = anchorNode?.getTopLevelElement() ?? null;

  return $isMarkdownHeadingNode(topLevelElement) ? topLevelElement : null;
};

type EditableMarkdownSourceTarget =
  | ImageNode
  | MathNode
  | MarkdownLinkNode
  | QuoteNode
  | LexicalNode;

const findActiveMarkdownSourceNode = (node: LexicalNode): EditableMarkdownSourceTarget | null => {
  let currentNode: LexicalNode | null = node;
  while (currentNode) {
    if (
      $isMathNode(currentNode) ||
      $isMarkdownLinkNode(currentNode) ||
      $isImageNode(currentNode) ||
      $isQuoteNode(currentNode)
    ) {
      return currentNode;
    }
    currentNode = currentNode.getParent();
  }

  return null;
};

const getActiveMarkdownSourceNode = (): EditableMarkdownSourceTarget | null => {
  const selection = $getSelection();
  if ($isNodeSelection(selection)) {
    for (const node of selection.getNodes()) {
      const markdownSourceNode = findActiveMarkdownSourceNode(node);
      if (markdownSourceNode) {
        return markdownSourceNode;
      }
    }
  }

  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return null;
  }

  const anchorNode = selection.anchor.getNode();
  const markdownSourceNode = findActiveMarkdownSourceNode(anchorNode);
  if (markdownSourceNode) {
    return markdownSourceNode;
  }

  return getFormattedTextKind(anchorNode) ? anchorNode : null;
};

type EditableMarkdownSourceKind =
  | "bold"
  | "bold-italic"
  | "block-quote"
  | "block-math"
  | "image"
  | "inline-code"
  | "inline-math"
  | "italic"
  | "link"
  | "strikethrough";

interface EditableMarkdownSourceState {
  kind: EditableMarkdownSourceKind;
  nodeKey: NodeKey;
  previewNodeKey?: NodeKey;
  sourceWasUnmergeable?: boolean;
  sourceNodeKeys?: NodeKey[];
}

interface EditableMarkdownSourceDeactivationResult {
  restoredNodeKey: NodeKey | null;
  success: boolean;
}

interface EditableMarkdownBlockSourceState {
  kind: "heading" | "list-item";
  nodeKey: NodeKey;
}

interface CurrentBlockSourcePluginProps {
  editableMarkdownSourceRef: MutableRefObject<EditableMarkdownSourceState | null>;
  onEditableMarkdownSourceCommit: (markdown: string) => void;
}

const isSelectionInsideNode = (node: LexicalNode): boolean => {
  const selection = $getSelection();
  if ($isNodeSelection(selection)) {
    return selection.getNodes().some((selectedNode) => {
      return selectedNode.is(node) || ($isElementNode(node) && node.isParentOf(selectedNode));
    });
  }

  if (!$isRangeSelection(selection)) {
    return false;
  }

  const anchorNode = selection.anchor.getNode();
  const focusNode = selection.focus.getNode();
  return (
    anchorNode.is(node) ||
    focusNode.is(node) ||
    ($isElementNode(node) && (node.isParentOf(anchorNode) || node.isParentOf(focusNode)))
  );
};

const getEditableMarkdownSourceNode = (
  state: EditableMarkdownSourceState | null,
): LexicalNode | null => {
  if (!state) {
    return null;
  }

  return (
    $getNodeByKey(state.nodeKey) ??
    state.sourceNodeKeys
      ?.map((nodeKey) => $getNodeByKey(nodeKey))
      .find((node): node is LexicalNode => node !== null) ??
    null
  );
};

const isSelectionInsideEditableMarkdownSource = (
  state: EditableMarkdownSourceState | null,
): boolean => {
  if (state?.sourceNodeKeys) {
    return state.sourceNodeKeys.some((nodeKey) => {
      const node = $getNodeByKey(nodeKey);
      return node ? isSelectionInsideNode(node) : false;
    });
  }

  const node = getEditableMarkdownSourceNode(state);
  return node ? isSelectionInsideNode(node) : false;
};

const getMarkdownLinkSourceParts = (
  node: MarkdownLinkNode,
): { label: string; prefix: string; suffix: string } => {
  const title = node.getTitle();
  return {
    label: escapeMarkdownLinkText(node.getTextContent()),
    prefix: "[",
    suffix: `](${node.getURL()}${title ? ` "${escapeMarkdownLinkTitle(title)}"` : ""})`,
  };
};

const getEditableMarkdownSourceText = (state: EditableMarkdownSourceState): string => {
  if (!state.sourceNodeKeys) {
    return getEditableMarkdownSourceNode(state)?.getTextContent() ?? "";
  }

  return state.sourceNodeKeys
    .map((nodeKey) => $getNodeByKey(nodeKey)?.getTextContent() ?? "")
    .join("");
};

const getCollapsedSelectionTextOffsetInSourceNodes = (
  state: EditableMarkdownSourceState,
): number | null => {
  if (!state.sourceNodeKeys) {
    const node = getEditableMarkdownSourceNode(state);
    return node ? getCollapsedSelectionTextOffsetInNode(node) : null;
  }

  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return null;
  }

  const anchorNode = selection.anchor.getNode();
  let sourceOffset = 0;
  for (const nodeKey of state.sourceNodeKeys) {
    const node = $getNodeByKey(nodeKey);
    if (!node) {
      continue;
    }

    if (anchorNode.is(node)) {
      return sourceOffset + Math.min(selection.anchor.offset, node.getTextContentSize());
    }

    sourceOffset += node.getTextContentSize();
  }

  return null;
};

const getElementTextOffsetBeforeChildIndex = (node: LexicalNode, childIndex: number): number => {
  if (!$isElementNode(node)) {
    return 0;
  }

  return node
    .getChildren()
    .slice(0, childIndex)
    .reduce((offset, childNode) => {
      return offset + childNode.getTextContentSize();
    }, 0);
};

const getCollapsedSelectionTextOffsetInNode = (node: LexicalNode): number | null => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return null;
  }

  const anchorNode = selection.anchor.getNode();
  const anchorOffset = selection.anchor.offset;

  if (anchorNode.is(node)) {
    if ($isTextNode(node)) {
      return Math.min(anchorOffset, node.getTextContentSize());
    }

    return getElementTextOffsetBeforeChildIndex(node, anchorOffset);
  }

  if (!$isElementNode(node)) {
    return null;
  }

  let textOffset = 0;
  const visitNode = (currentNode: LexicalNode): boolean => {
    if (currentNode.is(anchorNode)) {
      if ($isTextNode(currentNode)) {
        textOffset += Math.min(anchorOffset, currentNode.getTextContentSize());
        return true;
      }

      textOffset += getElementTextOffsetBeforeChildIndex(currentNode, anchorOffset);
      return true;
    }

    if ($isElementNode(currentNode)) {
      for (const childNode of currentNode.getChildren()) {
        if (visitNode(childNode)) {
          return true;
        }
      }
      return false;
    }

    textOffset += currentNode.getTextContentSize();
    return false;
  };

  return visitNode(node) ? textOffset : null;
};

const selectTextNodeOffset = (node: LexicalNode, offset: number): void => {
  if (!$isTextNode(node)) {
    if ($isElementNode(node)) {
      node.selectStart();
    }
    return;
  }

  const textContentSize = node.getTextContentSize();
  const normalizedOffset = Math.min(Math.max(offset, 0), textContentSize);
  node.select(normalizedOffset, normalizedOffset);
};

const logEditableMarkdownSourceExpansion = (
  state: EditableMarkdownSourceState,
  sourceText: string,
): EditableMarkdownSourceState => {
  console.log("[DocumentEditor] markdown source expand", {
    kind: state.kind,
    nodeKey: state.nodeKey,
    sourceNodeKeys: state.sourceNodeKeys ?? null,
    sourceText,
  });
  return state;
};

const logEditableMarkdownSourceRestoreSuccess = (
  state: EditableMarkdownSourceState,
  restoredNodeKey: NodeKey,
  sourceText: string,
): EditableMarkdownSourceDeactivationResult => {
  console.log("[DocumentEditor] markdown source restore", {
    kind: state.kind,
    nodeKey: state.nodeKey,
    restoredNodeKey,
    sourceText,
    success: true,
  });
  return {
    restoredNodeKey,
    success: true,
  };
};

const logEditableMarkdownSourceRestoreFailure = (
  state: EditableMarkdownSourceState | null,
  reason: string,
  sourceText: string | null = null,
): EditableMarkdownSourceDeactivationResult => {
  console.log("[DocumentEditor] markdown source restore failed", {
    kind: state?.kind ?? null,
    nodeKey: state?.nodeKey ?? null,
    reason,
    sourceText,
    success: false,
  });
  return {
    restoredNodeKey: null,
    success: false,
  };
};

const activateEditableMarkdownSource = (node: LexicalNode): EditableMarkdownSourceState | null => {
  if ($isMarkdownLinkNode(node)) {
    const linkText = node.getTextContent();
    const labelOffset = getCollapsedSelectionTextOffsetInNode(node);
    const labelSourceOffset =
      labelOffset === null ? 0 : getEscapedMarkdownLinkTextOffset(linkText, labelOffset);
    const sourceParts = getMarkdownLinkSourceParts(node);
    const prefixNode = $createTextNode(sourceParts.prefix);
    const labelNode = $createTextNode(sourceParts.label);
    const suffixNode = $createTextNode(sourceParts.suffix);
    prefixNode.setStyle(EDITABLE_LINK_MARKER_SOURCE_STYLE);
    labelNode.setStyle(EDITABLE_LINK_LABEL_SOURCE_STYLE);
    suffixNode.setStyle(EDITABLE_LINK_MARKER_SOURCE_STYLE);
    node.replace(labelNode);
    labelNode.insertBefore(prefixNode);
    labelNode.insertAfter(suffixNode);
    selectTextNodeOffset(labelNode, labelSourceOffset);
    return logEditableMarkdownSourceExpansion(
      {
        kind: "link",
        nodeKey: prefixNode.getKey(),
        sourceNodeKeys: [prefixNode.getKey(), labelNode.getKey(), suffixNode.getKey()],
      },
      `${sourceParts.prefix}${sourceParts.label}${sourceParts.suffix}`,
    );
  }

  if ($isImageNode(node)) {
    const sourceText = getImageMarkdownSourceText(node.getAltText(), node.getSrc(), node.getHref());
    const sourceTextNode = $createTextNode(sourceText);
    sourceTextNode.setFormat(IS_CODE);
    sourceTextNode.setStyle("color: var(--color-memora-text);");
    const paragraphNode = $createParagraphNode();
    paragraphNode.append(sourceTextNode);
    node.insertBefore(paragraphNode);
    selectTextNodeOffset(sourceTextNode, sourceText.length);
    return logEditableMarkdownSourceExpansion(
      {
        kind: "image",
        nodeKey: paragraphNode.getKey(),
        previewNodeKey: node.getKey(),
        sourceNodeKeys: [sourceTextNode.getKey()],
      },
      sourceText,
    );
  }

  if ($isQuoteNode(node)) {
    const quoteText = node.getTextContent();
    const sourceText = getQuoteMarkdownSourceText(node);
    const quoteOffset = getCollapsedSelectionTextOffsetInNode(node);
    const sourceTextNode = $createTextNode(sourceText);
    const paragraphNode = $createParagraphNode();
    paragraphNode.append(sourceTextNode);
    node.replace(paragraphNode);
    selectTextNodeOffset(
      sourceTextNode,
      getQuoteSourceOffsetFromContentOffset(quoteText, quoteOffset ?? 0),
    );
    return logEditableMarkdownSourceExpansion(
      {
        kind: "block-quote",
        nodeKey: paragraphNode.getKey(),
      },
      sourceText,
    );
  }

  const formattedTextKind = getFormattedTextKind(node);
  if (formattedTextKind && $isTextNode(node)) {
    const text = node.getTextContent();
    const labelOffset = getCollapsedSelectionTextOffsetInNode(node);
    const sourceText = getFormattedTextSourceText(formattedTextKind, text);
    const sourceWasUnmergeable = node.isUnmergeable();
    node.setTextContent(sourceText);
    if (!sourceWasUnmergeable) {
      node.toggleUnmergeable();
    }
    selectTextNodeOffset(
      node,
      getFormattedTextSourceOffsetFromLabelOffset(formattedTextKind, text, labelOffset),
    );
    return logEditableMarkdownSourceExpansion(
      {
        kind: formattedTextKind === "code" ? "inline-code" : formattedTextKind,
        nodeKey: node.getKey(),
        sourceNodeKeys: [node.getKey()],
        sourceWasUnmergeable,
      },
      sourceText,
    );
  }

  if ($isMathNode(node)) {
    const sourceText = `$$${node.getFormula()}$$`;
    const sourceOffset = 2;
    if (node.getDisplayMode()) {
      const sourceTextNode = $createTextNode(sourceText);
      sourceTextNode.setFormat(IS_CODE);
      sourceTextNode.setStyle("color: var(--color-memora-text);");
      const paragraphNode = $createParagraphNode();
      paragraphNode.append(sourceTextNode);
      node.insertBefore(paragraphNode);
      selectTextNodeOffset(sourceTextNode, sourceOffset);
      return logEditableMarkdownSourceExpansion(
        {
          kind: "block-math",
          nodeKey: paragraphNode.getKey(),
          previewNodeKey: node.getKey(),
          sourceNodeKeys: [sourceTextNode.getKey()],
        },
        sourceText,
      );
    }

    const sourceTextNode = $createTextNode(sourceText);
    sourceTextNode.setFormat(IS_CODE);
    node.replace(sourceTextNode);
    selectTextNodeOffset(sourceTextNode, sourceOffset);
    return logEditableMarkdownSourceExpansion(
      {
        kind: "inline-math",
        nodeKey: sourceTextNode.getKey(),
        sourceNodeKeys: [sourceTextNode.getKey()],
      },
      sourceText,
    );
  }

  return null;
};

const deactivateEditableMarkdownSource = (
  state: EditableMarkdownSourceState | null,
): EditableMarkdownSourceDeactivationResult => {
  const node = getEditableMarkdownSourceNode(state);
  if (!state || !node) {
    return logEditableMarkdownSourceRestoreFailure(state, "missing source node");
  }

  const sourceText = getEditableMarkdownSourceText(state);
  if (state.kind === "link") {
    const parsedLink = parseMarkdownLink(sourceText);
    const sourceNodes = state.sourceNodeKeys
      ?.map((nodeKey) => $getNodeByKey(nodeKey))
      .filter((sourceNode): sourceNode is LexicalNode => sourceNode !== null) ?? [node];
    const firstSourceNode = sourceNodes[0] ?? null;
    if (!firstSourceNode || !sourceNodes.every($isTextNode) || !parsedLink) {
      return logEditableMarkdownSourceRestoreFailure(state, "invalid link source", sourceText);
    }

    const sourceSelectionOffset = getCollapsedSelectionTextOffsetInSourceNodes(state);
    const linkNode = new MarkdownLinkNode(parsedLink.href, {
      title: parsedLink.title ?? null,
    });
    linkNode.append($createTextNode(parsedLink.text));
    for (const sourceNode of sourceNodes.slice(1)) {
      sourceNode.remove();
    }
    firstSourceNode.replace(linkNode);
    if (sourceSelectionOffset !== null) {
      const labelOffset = getMarkdownLinkLabelOffsetFromSourceOffset(
        sourceText,
        sourceSelectionOffset,
      );
      const linkTextNode = linkNode.getFirstChild();
      if ($isTextNode(linkTextNode)) {
        linkTextNode.select(
          Math.min(labelOffset, linkTextNode.getTextContentSize()),
          Math.min(labelOffset, linkTextNode.getTextContentSize()),
        );
      }
    }
    return logEditableMarkdownSourceRestoreSuccess(state, linkNode.getKey(), sourceText);
  }

  if (state.kind === "image") {
    const previewNode = state.previewNodeKey ? $getNodeByKey(state.previewNodeKey) : null;
    if (!$isElementNode(node) || !$isImageNode(previewNode)) {
      return logEditableMarkdownSourceRestoreFailure(state, "invalid image source", sourceText);
    }

    const parsedLinkedImage = parseMarkdownLinkedImage(sourceText.trim());
    const parsedImage = parsedLinkedImage ?? parseMarkdownImage(sourceText.trim());
    if (!parsedImage) {
      return logEditableMarkdownSourceRestoreFailure(state, "invalid image source", sourceText);
    }

    const imageNode = new ImageNode(
      parsedImage.src,
      parsedImage.altText,
      parsedLinkedImage?.href ?? null,
    );
    previewNode.replace(imageNode);
    node.remove();
    return logEditableMarkdownSourceRestoreSuccess(state, imageNode.getKey(), sourceText);
  }

  if (
    state.kind === "inline-code" ||
    state.kind === "bold" ||
    state.kind === "bold-italic" ||
    state.kind === "italic" ||
    state.kind === "strikethrough"
  ) {
    if (!$isTextNode(node)) {
      return logEditableMarkdownSourceRestoreFailure(state, "source node is not text", sourceText);
    }

    const formattedTextKind: EditableFormattedTextKind =
      state.kind === "inline-code" ? "code" : state.kind;
    const parsedSource = parseFormattedTextSourceText(formattedTextKind, sourceText);
    if (parsedSource === null) {
      return logEditableMarkdownSourceRestoreFailure(
        state,
        "invalid formatted text source",
        sourceText,
      );
    }

    const sourceSelectionOffset = getCollapsedSelectionTextOffsetInNode(node);
    node.setTextContent(parsedSource.text);
    node.setFormat(getFormattedTextFormat(formattedTextKind));
    if (!state.sourceWasUnmergeable && node.isUnmergeable()) {
      node.toggleUnmergeable();
    }
    if (parsedSource.prefix) {
      const prefixNode = $createTextNode(parsedSource.prefix);
      node.insertBefore(prefixNode);
    }
    if (parsedSource.suffix) {
      node.insertAfter($createTextNode(parsedSource.suffix));
    }
    if (sourceSelectionOffset !== null) {
      const labelOffset = getFormattedTextLabelOffsetFromSourceOffset(
        sourceText,
        sourceSelectionOffset,
        formattedTextKind,
      );
      selectTextNodeOffset(node, labelOffset);
    }
    return logEditableMarkdownSourceRestoreSuccess(state, node.getKey(), sourceText);
  }

  if (state.kind === "inline-math") {
    const parsedMath = parseInlineMath(sourceText);
    if (!$isTextNode(node) || !parsedMath) {
      return logEditableMarkdownSourceRestoreFailure(
        state,
        "invalid inline math source",
        sourceText,
      );
    }

    const mathNode = new MathNode(
      parsedMath.formula,
      false,
      undefined,
      false,
      parsedMath.delimiter,
    );
    node.replace(mathNode);
    return logEditableMarkdownSourceRestoreSuccess(state, mathNode.getKey(), sourceText);
  }

  if (state.kind === "block-quote") {
    const parsedQuote = parseQuoteMarkdownSourceText(sourceText);
    if (!$isElementNode(node) || parsedQuote === null) {
      return logEditableMarkdownSourceRestoreFailure(
        state,
        "invalid block quote source",
        sourceText,
      );
    }

    const sourceSelectionOffset = getCollapsedSelectionTextOffsetInNode(node);
    const quoteNode = $createQuoteNode();
    const quoteTextNode = $createTextNode(parsedQuote);
    quoteNode.append(quoteTextNode);
    node.replace(quoteNode);
    if (sourceSelectionOffset !== null) {
      selectTextNodeOffset(
        quoteTextNode,
        getQuoteContentOffsetFromSourceOffset(sourceText, sourceSelectionOffset),
      );
    }
    return logEditableMarkdownSourceRestoreSuccess(state, quoteNode.getKey(), sourceText);
  }

  if (state.kind === "block-math") {
    const previewNode = state.previewNodeKey ? $getNodeByKey(state.previewNodeKey) : null;
    const parsedMath = parseMathBlock(sourceText);
    if (!$isElementNode(node) || !$isMathNode(previewNode) || !parsedMath) {
      return logEditableMarkdownSourceRestoreFailure(
        state,
        "invalid block math source",
        sourceText,
      );
    }

    const mathNode = new MathNode(parsedMath.formula, true);
    previewNode.replace(mathNode);
    node.remove();
    return logEditableMarkdownSourceRestoreSuccess(state, mathNode.getKey(), sourceText);
  }

  if (!$isMathNode(node)) {
    return logEditableMarkdownSourceRestoreFailure(state, "invalid block math source", sourceText);
  }

  node.setMarkdownSourceActive(false);
  return logEditableMarkdownSourceRestoreSuccess(state, node.getKey(), sourceText);
};

const isSelectionAtStartOfNode = (node: LexicalNode): boolean => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }

  let anchorNode: LexicalNode = selection.anchor.getNode();
  if (anchorNode.is(node)) {
    return selection.anchor.offset === 0;
  }

  if (!$isTextNode(anchorNode) || selection.anchor.offset !== 0) {
    return false;
  }

  while (!anchorNode.is(node)) {
    if (anchorNode.getPreviousSibling() !== null) {
      return false;
    }

    const parentNode: LexicalNode | null = anchorNode.getParent();
    if (!parentNode) {
      return false;
    }

    anchorNode = parentNode;
  }

  return true;
};

const getHeadingLevel = (headingNode: MarkdownHeadingNode): number => {
  return Number(headingNode.getTag().slice(1));
};

const toHeadingTag = (level: number): HeadingTagType => {
  return `h${Math.min(Math.max(level, 1), 6)}` as HeadingTagType;
};

export const deleteMarkdownHeadingPrefixCharacter = (headingNode: MarkdownHeadingNode): boolean => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }

  const firstChild = headingNode.getFirstChild();
  if (!$isTextNode(firstChild) || !selection.anchor.getNode().is(firstChild)) {
    return false;
  }

  const prefix = getMarkdownHeadingPrefix(headingNode);
  const offset = selection.anchor.offset;
  const text = firstChild.getTextContent();
  if (offset < 1 || offset > prefix.length || !text.startsWith(prefix)) {
    return false;
  }

  firstChild.setTextContent(`${text.slice(0, offset - 1)}${text.slice(offset)}`);
  selectTextNodeOffset(firstChild, offset - 1);
  return true;
};

const clearMarkdownSourceNode = (nodeKey: NodeKey | null): void => {
  if (!nodeKey) {
    return;
  }

  const node = $getNodeByKey(nodeKey);
  if ($isMarkdownHeadingNode(node) || $isMarkdownListItemNode(node)) {
    node.setMarkdownSourcePrefix(null);
  }
};

export const prependMarkdownSourcePrefix = (
  node: MarkdownHeadingNode | MarkdownListItemNode,
): void => {
  const prefix = $isMarkdownHeadingNode(node)
    ? getMarkdownHeadingPrefix(node)
    : getMarkdownListItemPrefix(node);
  const prefixNode = $createTextNode(prefix);
  prefixNode.setStyle("color: var(--color-memora-text-muted);");
  const shouldSelectAfterPrefix =
    node.getTextContentSize() === 0 && getCollapsedSelectionTextOffsetInNode(node) === 0;
  const firstChild = node.getFirstChild();
  if (firstChild) {
    firstChild.insertBefore(prefixNode);
  } else {
    node.append(prefixNode);
  }
  node.setMarkdownSourcePrefix(prefix);
  if (shouldSelectAfterPrefix) {
    selectTextNodeOffset(prefixNode, prefix.length);
  }
};

const removeMarkdownSourcePrefix = (
  node: MarkdownHeadingNode | MarkdownListItemNode,
  kind: "heading" | "list-item",
): string | null => {
  const firstChild = node.getFirstChild();
  if (!$isTextNode(firstChild)) {
    node.setMarkdownSourcePrefix(null);
    return null;
  }

  const prefixText = firstChild.getTextContent();
  if (kind === "heading") {
    const parsedPrefix = prefixText.match(/^(#{1,6})([ \t]*)([\s\S]*)$/);
    const headingContent = parsedPrefix?.[3] ?? "";
    if (headingContent) {
      firstChild.insertAfter($createTextNode(headingContent));
    }
  } else {
    const parsedPrefix = prefixText.match(/^(\s*)(?:[-+*]|\d+\.)\s*(?:\[(?:x| )\]\s*)?([\s\S]*)$/i);
    const listContent = parsedPrefix?.[2] ?? "";
    if (listContent) {
      firstChild.insertAfter($createTextNode(listContent));
    }
  }

  firstChild.remove();
  node.setMarkdownSourcePrefix(null);
  if ($isMarkdownHeadingNode(node)) {
    const headingPrefix = prefixText.match(/^(#{1,6})([ \t]*)([\s\S]*)$/)?.[1] ?? "";
    if (headingPrefix.length > 0) {
      node.setTag(toHeadingTag(headingPrefix.length));
    } else {
      const paragraphNode = $createParagraphNode();
      paragraphNode.append(...node.getChildren());
      node.replace(paragraphNode, true);
    }
  }
  return prefixText;
};

const getCodeNodeForFence = (fenceNode: CodeFenceNode): CodeNode | null => {
  const sibling =
    fenceNode.getRole() === "open" ? fenceNode.getNextSibling() : fenceNode.getPreviousSibling();
  return $isCodeNode(sibling) ? sibling : null;
};

const findCodeFenceNode = (node: LexicalNode): CodeFenceNode | null => {
  let currentNode: LexicalNode | null = node;
  while (currentNode) {
    if ($isCodeFenceNode(currentNode)) {
      return currentNode;
    }
    currentNode = currentNode.getParent();
  }

  return null;
};

const findCodeNode = (node: LexicalNode): CodeNode | null => {
  let currentNode: LexicalNode | null = node;
  while (currentNode) {
    if ($isCodeNode(currentNode)) {
      return currentNode;
    }
    currentNode = currentNode.getParent();
  }

  const fenceNode = findCodeFenceNode(node);
  return fenceNode ? getCodeNodeForFence(fenceNode) : null;
};

const getActiveCodeNode = (): CodeNode | null => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return null;
  }

  return findCodeNode(selection.anchor.getNode()) ?? findCodeNode(selection.focus.getNode());
};

const parseCodeFenceLanguage = (fenceText: string): string | null => {
  const match = fenceText.match(/^`{3,}([A-Za-z0-9_-]+)?/);
  return match?.[1] || null;
};

const ensureCodeFences = (
  codeNode: CodeNode,
): {
  closeFence: CodeFenceNode;
  openFence: CodeFenceNode;
} => {
  const language = codeNode.getLanguage() ?? "";
  const previousSibling = codeNode.getPreviousSibling();
  const nextSibling = codeNode.getNextSibling();
  let openFence: CodeFenceNode;
  if ($isCodeFenceNode(previousSibling) && previousSibling.getRole() === "open") {
    openFence = previousSibling;
  } else {
    openFence = $createCodeFenceNode("open", `\`\`\`${language}`);
    codeNode.insertBefore(openFence);
  }

  let closeFence: CodeFenceNode;
  if ($isCodeFenceNode(nextSibling) && nextSibling.getRole() === "close") {
    closeFence = nextSibling;
  } else {
    closeFence = $createCodeFenceNode("close", "```");
    codeNode.insertAfter(closeFence);
  }

  return {
    closeFence,
    openFence,
  };
};

function CodeShikiPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return registerCodeHighlighting(editor);
  }, [editor]);

  return null;
}

function CodeFencePlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const syncCodeFencesInUpdate = (): void => {
      const root = $getRoot();
      const activeCodeNode = getActiveCodeNode();
      const activeCodeNodeKey = activeCodeNode?.getKey() ?? null;

      for (const child of root.getChildren()) {
        if ($isCodeNode(child)) {
          const { openFence } = ensureCodeFences(child);
          const language = parseCodeFenceLanguage(openFence.getTextContent());
          if (language && child.getLanguage() !== language) {
            child.setLanguage(language);
          }
          const nextStyle =
            child.getKey() === activeCodeNodeKey ? CODE_BLOCK_WITH_FENCES_STYLE : "";
          if (child.getStyle() !== nextStyle) {
            child.setStyle(nextStyle);
          }
          continue;
        }

        if ($isCodeFenceNode(child) && !getCodeNodeForFence(child)) {
          child.remove();
        }
      }

      for (const child of root.getChildren()) {
        if (!$isCodeFenceNode(child)) {
          continue;
        }

        const codeNode = getCodeNodeForFence(child);
        child.setActive(codeNode?.getKey() === activeCodeNodeKey);
      }
    };

    const syncCodeFences = (): void => {
      editor.update(
        () => {
          syncCodeFencesInUpdate();
        },
        {
          tag: [HISTORY_MERGE_TAG, HISTORIC_TAG],
        },
      );
    };

    syncCodeFences();
    return mergeRegister(
      editor.registerNodeTransform(CodeNode, () => {
        syncCodeFencesInUpdate();
      }),
      editor.registerNodeTransform(CodeFenceNode, () => {
        syncCodeFencesInUpdate();
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          syncCodeFencesInUpdate();
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    );
  }, [editor]);

  return null;
}

function CurrentBlockSourcePlugin({
  editableMarkdownSourceRef,
  onEditableMarkdownSourceCommit,
}: CurrentBlockSourcePluginProps) {
  const [editor] = useLexicalComposerContext();
  const activeNodeKeyRef = useRef<NodeKey | null>(null);
  const activeMarkdownBlockSourceRef = useRef<EditableMarkdownBlockSourceState | null>(null);
  const onEditableMarkdownSourceCommitRef = useRef(onEditableMarkdownSourceCommit);

  useEffect(() => {
    onEditableMarkdownSourceCommitRef.current = onEditableMarkdownSourceCommit;
  }, [onEditableMarkdownSourceCommit]);

  useEffect(() => {
    const syncCurrentEditorState = (): void => {
      let shouldCommitEditableMarkdownSource = false;

      editor.update(
        () => {
          let restoredEditableMarkdownSourceNodeKey: NodeKey | null = null;
          const activeSource = getActiveMarkdownSource();
          const nextNodeKey = activeSource?.node.getKey() ?? null;
          const activeMarkdownBlockSource = activeMarkdownBlockSourceRef.current;
          const editableMarkdownSource = editableMarkdownSourceRef.current;

          if (activeMarkdownBlockSource && activeMarkdownBlockSource.nodeKey !== nextNodeKey) {
            const previousMarkdownSourceNode = $getNodeByKey(activeMarkdownBlockSource.nodeKey);
            if (
              $isMarkdownHeadingNode(previousMarkdownSourceNode) ||
              $isMarkdownListItemNode(previousMarkdownSourceNode)
            ) {
              removeMarkdownSourcePrefix(
                previousMarkdownSourceNode,
                activeMarkdownBlockSource.kind,
              );
            }
            activeMarkdownBlockSourceRef.current = null;
          }

          if (
            activeSource &&
            activeMarkdownBlockSourceRef.current?.nodeKey !== activeSource.node.getKey()
          ) {
            if (
              $isMarkdownHeadingNode(activeSource.node) ||
              $isMarkdownListItemNode(activeSource.node)
            ) {
              prependMarkdownSourcePrefix(activeSource.node);
              activeMarkdownBlockSourceRef.current = {
                kind: $isMarkdownHeadingNode(activeSource.node) ? "heading" : "list-item",
                nodeKey: activeSource.node.getKey(),
              };
            }
          }

          if (isSelectionInsideEditableMarkdownSource(editableMarkdownSource)) {
            activeNodeKeyRef.current = nextNodeKey;
            return;
          }

          if (editableMarkdownSource) {
            const deactivationResult = deactivateEditableMarkdownSource(editableMarkdownSource);
            editableMarkdownSourceRef.current = null;
            if (deactivationResult.success) {
              shouldCommitEditableMarkdownSource = true;
              restoredEditableMarkdownSourceNodeKey = deactivationResult.restoredNodeKey;
            }
          }

          const activeMarkdownSourceNode = getActiveMarkdownSourceNode();
          if (
            activeMarkdownSourceNode &&
            activeMarkdownSourceNode.getKey() !== restoredEditableMarkdownSourceNodeKey
          ) {
            editableMarkdownSourceRef.current =
              activateEditableMarkdownSource(activeMarkdownSourceNode);
          }

          activeNodeKeyRef.current = nextNodeKey;
        },
        {
          tag: [HISTORY_MERGE_TAG, HISTORIC_TAG],
        },
      );

      if (shouldCommitEditableMarkdownSource) {
        onEditableMarkdownSourceCommitRef.current(exportWysiwygMarkdown(editor.getEditorState()));
      }
    };

    syncCurrentEditorState();
    return mergeRegister(
      editor.registerNodeTransform(HeadingNode, (node) => {
        if ($isMarkdownHeadingNode(node)) {
          return;
        }

        node.replace(new MarkdownHeadingNode(node.getTag()), true);
      }),
      editor.registerNodeTransform(ListItemNode, (node) => {
        if ($isMarkdownListItemNode(node)) {
          return;
        }

        if (node.getChildrenSize() === 0) {
          return;
        }

        const replacement = new MarkdownListItemNode(node.getValue(), node.getChecked());
        replacement.append(...node.getChildren());
        node.replace(replacement);
      }),
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        (event) => {
          const headingNode = getActiveMarkdownHeading();
          if (headingNode && deleteMarkdownHeadingPrefixCharacter(headingNode)) {
            event.preventDefault();
            return true;
          }

          if (!headingNode || !isSelectionAtStartOfNode(headingNode)) {
            return false;
          }

          event.preventDefault();
          const headingLevel = getHeadingLevel(headingNode);
          if (headingLevel === 1) {
            headingNode.replace($createParagraphNode(), true).selectStart();
            return true;
          }

          headingNode.setTag(toHeadingTag(headingLevel - 1));
          headingNode.selectStart();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          if (event.key !== "#") {
            return false;
          }

          const headingNode = getActiveMarkdownHeading();
          if (!headingNode || !isSelectionAtStartOfNode(headingNode)) {
            return false;
          }

          event.preventDefault();
          const headingLevel = getHeadingLevel(headingNode);
          headingNode.setTag(toHeadingTag(headingLevel + 1));
          headingNode.selectStart();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerUpdateListener(() => {
        syncCurrentEditorState();
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          syncCurrentEditorState();
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    );
  }, [editor, editableMarkdownSourceRef]);

  useEffect(() => {
    return () => {
      const shouldCommitEditableMarkdownSource = editableMarkdownSourceRef.current !== null;
      let didDeactivateEditableMarkdownSource = false;

      editor.update(
        () => {
          if (activeMarkdownBlockSourceRef.current) {
            const activeMarkdownSourceNode = $getNodeByKey(
              activeMarkdownBlockSourceRef.current.nodeKey,
            );
            if (
              $isMarkdownHeadingNode(activeMarkdownSourceNode) ||
              $isMarkdownListItemNode(activeMarkdownSourceNode)
            ) {
              removeMarkdownSourcePrefix(
                activeMarkdownSourceNode,
                activeMarkdownBlockSourceRef.current.kind,
              );
            }
            activeMarkdownBlockSourceRef.current = null;
          }
          clearMarkdownSourceNode(activeNodeKeyRef.current);
          const deactivationResult = deactivateEditableMarkdownSource(
            editableMarkdownSourceRef.current,
          );
          didDeactivateEditableMarkdownSource = deactivationResult.success;
          activeNodeKeyRef.current = null;
          if (didDeactivateEditableMarkdownSource) {
            editableMarkdownSourceRef.current = null;
          }
        },
        {
          tag: [HISTORY_MERGE_TAG, HISTORIC_TAG],
        },
      );

      if (shouldCommitEditableMarkdownSource && didDeactivateEditableMarkdownSource) {
        onEditableMarkdownSourceCommitRef.current(exportWysiwygMarkdown(editor.getEditorState()));
      }
    };
  }, [editor, editableMarkdownSourceRef]);

  return null;
}

// Retained for the localized P0 rollback path, but intentionally not mounted.
void CurrentBlockSourcePlugin;

export const WysiwygDocumentEditor = forwardRef<
  WysiwygDocumentEditorHandle,
  WysiwygDocumentEditorProps
>(function WysiwygDocumentEditor({ text, onActiveHeadingChange, onTextChange }, ref) {
  const editorRef = useRef<LexicalEditor | null>(null);
  const isImportingRef = useRef(false);
  const latestMarkdownRef = useRef(text);
  const onActiveHeadingChangeRef = useRef(onActiveHeadingChange);

  useEffect(() => {
    onActiveHeadingChangeRef.current = onActiveHeadingChange;
  }, [onActiveHeadingChange]);

  const commitMarkdown = useCallback(
    (markdown: string): void => {
      latestMarkdownRef.current = markdown;
      if (isImportingRef.current) {
        return;
      }

      if (normalizeMarkdownRoundTripText(markdown) !== normalizeMarkdownRoundTripText(text)) {
        onTextChange(markdown);
      }
    },
    [onTextChange, text],
  );

  const initialConfig = useMemo(() => {
    return {
      editorState: (editor: LexicalEditor) => {
        editor.update(() => {
          importWysiwygMarkdown(text);
        });
      },
      namespace: "memora-document-editor",
      nodes: WYSIWYG_NODES,
      onError: (error: Error) => {
        throw error;
      },
      theme,
    };
  }, [text]);

  useImperativeHandle(ref, () => {
    return {
      insertTable: () => {
        editorRef.current?.dispatchCommand(INSERT_TABLE_COMMAND, {
          columns: "3",
          rows: "3",
        });
      },
      revealHeading: (headingIndex: number) => {
        const rootElement = editorRef.current?.getRootElement();
        const heading =
          rootElement?.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")[headingIndex];
        if (!heading) {
          return;
        }

        const prefersReducedMotion = window.matchMedia?.(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        heading.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "start",
        });
      },
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    if (
      normalizeMarkdownRoundTripText(text) ===
      normalizeMarkdownRoundTripText(latestMarkdownRef.current)
    ) {
      return;
    }

    isImportingRef.current = true;
    editor.update(() => {
      importWysiwygMarkdown(text);
    });
    latestMarkdownRef.current = text;
    isImportingRef.current = false;
  }, [text]);

  useEffect(() => {
    if (!onActiveHeadingChangeRef.current) {
      return;
    }
    const rootElement = editorRef.current?.getRootElement();
    if (!rootElement) {
      return;
    }
    const headings = Array.from(
      rootElement.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"),
    );
    if (headings.length === 0) {
      return;
    }
    if (!("IntersectionObserver" in window)) {
      onActiveHeadingChangeRef.current(0);
      return;
    }

    const headingIndexes = new Map<HTMLElement, number>();
    const visibleHeadingIndexes = new Set<number>();
    headings.forEach((heading, index) => headingIndexes.set(heading, index));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const headingIndex = headingIndexes.get(entry.target as HTMLElement);
          if (headingIndex === undefined) {
            continue;
          }
          if (entry.isIntersecting) {
            visibleHeadingIndexes.add(headingIndex);
          } else {
            visibleHeadingIndexes.delete(headingIndex);
          }
        }
        if (visibleHeadingIndexes.size === 0) {
          return;
        }
        let activeHeadingIndex = 0;
        for (const headingIndex of visibleHeadingIndexes) {
          activeHeadingIndex = Math.max(activeHeadingIndex, headingIndex);
        }
        onActiveHeadingChangeRef.current?.(activeHeadingIndex);
      },
      {
        rootMargin: "0px 0px -65% 0px",
        threshold: 0,
      },
    );

    headings.forEach((heading) => observer.observe(heading));
    return () => {
      observer.disconnect();
    };
  }, [text]);

  return (
    <section
      className="w-full"
      data-surface="wysiwyg-document-editor"
      data-testid="wysiwyg-document-editor"
    >
      <LexicalComposer initialConfig={initialConfig}>
        <EditorRefPlugin editorRef={editorRef} />
        <HistoryPlugin />
        <ListPlugin />
        <CheckListPlugin />
        <HorizontalRulePlugin />
        <LinkPlugin />
        <TablePlugin hasCellMerge={false} />
        <CodeShikiPlugin />
        <CodeFencePlugin />
        <MarkdownShortcutPlugin transformers={WYSIWYG_TRANSFORMERS} />
        <SlashCommandPlugin />
        <WysiwygFormattingToolbar />
        <MathEditorPopover />
        <OnChangePlugin
          ignoreSelectionChange={true}
          onChange={(editorState) => {
            const markdown = exportWysiwygMarkdown(editorState);
            commitMarkdown(markdown);
          }}
        />
        <div className="relative">
          <RichTextPlugin
            ErrorBoundary={LexicalErrorBoundary}
            contentEditable={
              <ContentEditable
                aria-label="Document wysiwyg editor"
                className="min-h-[420px] leading-7 text-[var(--color-memora-text)] outline-none"
                data-testid="wysiwyg-contenteditable"
                style={{
                  fontSize: "var(--document-editor-font-size, 16px)",
                }}
              />
            }
            placeholder={
              <div
                className="pointer-events-none absolute left-0 top-0 leading-7 text-[var(--color-memora-text-soft)]"
                style={{
                  fontSize: "var(--document-editor-font-size, 16px)",
                }}
              >
                {PLACEHOLDER}
              </div>
            }
          />
        </div>
      </LexicalComposer>
    </section>
  );
});
