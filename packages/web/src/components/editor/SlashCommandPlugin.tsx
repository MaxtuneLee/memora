import { useCallback, useMemo, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import {
  CodeBlockIcon,
  ListBulletsIcon,
  ListChecksIcon,
  ListNumbersIcon,
  MathOperationsIcon,
  MinusIcon,
  QuotesIcon,
  TableIcon,
  TextHOneIcon,
  TextHTwoIcon,
  TextHThreeIcon,
  TextHFourIcon,
  TextHFiveIcon,
  TextHSixIcon,
  TextTIcon,
  type Icon,
} from "@phosphor-icons/react";
import { $createCodeNode } from "@lexical/code";
import { $insertList, type ListType } from "@lexical/list";
import { LexicalTypeaheadMenuPlugin, MenuOption } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { INSERT_HORIZONTAL_RULE_COMMAND } from "@lexical/react/LexicalHorizontalRuleNode";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createHeadingNode, $createQuoteNode, type HeadingTagType } from "@lexical/rich-text";
import { INSERT_TABLE_COMMAND } from "@lexical/table";
import {
  $createParagraphNode,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $setSelection,
  $createNodeSelection,
  type ElementNode,
  type TextNode,
  type LexicalEditor,
} from "lexical";

import { $createMathNode } from "@/components/editor/lexical/MathNode";

type SlashCommandKind =
  | "paragraph"
  | "heading"
  | "quote"
  | "bullet-list"
  | "numbered-list"
  | "check-list"
  | "code"
  | "math"
  | "table"
  | "divider";

interface SlashCommandDefinition {
  description: string;
  icon: Icon;
  keywords: readonly string[];
  kind: SlashCommandKind;
  label: string;
  level?: HeadingTagType;
}

export const SLASH_COMMAND_DEFINITIONS: readonly SlashCommandDefinition[] = [
  {
    description: "Plain body text",
    icon: TextTIcon,
    keywords: ["text", "paragraph", "正文", "文本"],
    kind: "paragraph",
    label: "Text",
  },
  {
    description: "Largest section heading",
    icon: TextHOneIcon,
    keywords: ["heading", "h1", "标题 1", "一级标题"],
    kind: "heading",
    label: "Heading 1",
    level: "h1",
  },
  {
    description: "Section heading",
    icon: TextHTwoIcon,
    keywords: ["heading", "h2", "标题 2", "二级标题"],
    kind: "heading",
    label: "Heading 2",
    level: "h2",
  },
  {
    description: "Subsection heading",
    icon: TextHThreeIcon,
    keywords: ["heading", "h3", "标题 3", "三级标题"],
    kind: "heading",
    label: "Heading 3",
    level: "h3",
  },
  {
    description: "Smaller subsection heading",
    icon: TextHFourIcon,
    keywords: ["heading", "h4", "标题 4", "四级标题"],
    kind: "heading",
    label: "Heading 4",
    level: "h4",
  },
  {
    description: "Small heading",
    icon: TextHFiveIcon,
    keywords: ["heading", "h5", "标题 5", "五级标题"],
    kind: "heading",
    label: "Heading 5",
    level: "h5",
  },
  {
    description: "Smallest heading",
    icon: TextHSixIcon,
    keywords: ["heading", "h6", "标题 6", "六级标题"],
    kind: "heading",
    label: "Heading 6",
    level: "h6",
  },
  {
    description: "Quoted passage or note",
    icon: QuotesIcon,
    keywords: ["quote", "blockquote", "引用", "引文"],
    kind: "quote",
    label: "Quote",
  },
  {
    description: "Bulleted list",
    icon: ListBulletsIcon,
    keywords: ["list", "bullet", "unordered", "无序", "列表"],
    kind: "bullet-list",
    label: "Bulleted list",
  },
  {
    description: "Numbered list",
    icon: ListNumbersIcon,
    keywords: ["list", "numbered", "ordered", "有序", "列表"],
    kind: "numbered-list",
    label: "Numbered list",
  },
  {
    description: "Checklist",
    icon: ListChecksIcon,
    keywords: ["list", "task", "todo", "check", "待办", "任务"],
    kind: "check-list",
    label: "Checklist",
  },
  {
    description: "Fenced code block",
    icon: CodeBlockIcon,
    keywords: ["code", "fence", "代码", "代码块"],
    kind: "code",
    label: "Code block",
  },
  {
    description: "Display LaTeX formula",
    icon: MathOperationsIcon,
    keywords: ["math", "latex", "formula", "数学", "公式"],
    kind: "math",
    label: "Math formula",
  },
  {
    description: "3 × 3 table with a header row",
    icon: TableIcon,
    keywords: ["table", "grid", "表格"],
    kind: "table",
    label: "Table",
  },
  {
    description: "Horizontal divider",
    icon: MinusIcon,
    keywords: ["divider", "rule", "separator", "分割线"],
    kind: "divider",
    label: "Divider",
  },
];

const LEXICAL_MENU_ANCHOR_OFFSET_PX = 3;
const SLASH_COMMAND_ANCHOR_GAP_PX = 12;
const SLASH_COMMAND_LINE_HEIGHT_PX = 28;

const getSlashCommandMenuAnchor = (anchorElement: HTMLElement) => {
  return {
    contextElement: anchorElement,
    getBoundingClientRect: (): DOMRect => {
      const caretAnchorRect = anchorElement.getBoundingClientRect();
      const caretHeight = Math.max(caretAnchorRect.height, 1);
      return new DOMRect(
        caretAnchorRect.left,
        caretAnchorRect.top - caretHeight - LEXICAL_MENU_ANCHOR_OFFSET_PX,
        Math.max(caretAnchorRect.width, 1),
        Math.max(caretHeight, SLASH_COMMAND_LINE_HEIGHT_PX),
      );
    },
  };
};

class SlashCommandOption extends MenuOption {
  readonly definition: SlashCommandDefinition;
  readonly setRefElement: (element: HTMLElement | null) => void;

  constructor(definition: SlashCommandDefinition) {
    super(definition.label);
    this.definition = definition;
    this.setRefElement = (element) => {
      super.setRefElement(element);
    };
  }
}

const getSlashCommandMatch = (text: string, _editor: LexicalEditor) => {
  const match = /^\/([^\n]*)$/.exec(text);
  if (!match) {
    return null;
  }

  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return null;
  }

  const block = selection.anchor.getNode().getTopLevelElementOrThrow();
  if (!$isParagraphNode(block) || block.getTextContent() !== text) {
    return null;
  }

  return {
    leadOffset: 0,
    matchingString: match[1] ?? "",
    replaceableString: text,
  };
};

const replaceCurrentParagraph = (replacement: ElementNode): void => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return;
  }

  const currentBlock = selection.anchor.getNode().getTopLevelElementOrThrow();
  if (!$isParagraphNode(currentBlock)) {
    return;
  }

  currentBlock.replace(replacement);
  replacement.selectStart();
};

const clearCurrentParagraph = (): boolean => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return false;
  }

  const currentBlock = selection.anchor.getNode().getTopLevelElementOrThrow();
  if (!$isParagraphNode(currentBlock)) {
    return false;
  }

  currentBlock.clear();
  currentBlock.selectStart();
  return true;
};

const insertList = (listType: ListType): void => {
  if (clearCurrentParagraph()) {
    $insertList(listType);
  }
};

const insertMathBlock = (): void => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return;
  }

  const currentBlock = selection.anchor.getNode().getTopLevelElementOrThrow();
  if (!$isParagraphNode(currentBlock)) {
    return;
  }

  const mathNode = $createMathNode("", true);
  const trailingParagraph = $createParagraphNode();
  currentBlock.replace(mathNode);
  mathNode.insertAfter(trailingParagraph);
  const nodeSelection = $createNodeSelection();
  nodeSelection.add(mathNode.getKey());
  $setSelection(nodeSelection);
};

const insertSlashCommand = (editor: LexicalEditor, option: SlashCommandOption): void => {
  const { kind, level } = option.definition;
  if (kind === "paragraph") {
    replaceCurrentParagraph($createParagraphNode());
    return;
  }
  if (kind === "heading" && level) {
    replaceCurrentParagraph($createHeadingNode(level));
    return;
  }
  if (kind === "quote") {
    replaceCurrentParagraph($createQuoteNode());
    return;
  }
  if (kind === "code") {
    replaceCurrentParagraph($createCodeNode());
    return;
  }
  if (kind === "math") {
    insertMathBlock();
    return;
  }
  if (kind === "bullet-list") {
    insertList("bullet");
    return;
  }
  if (kind === "numbered-list") {
    insertList("number");
    return;
  }
  if (kind === "check-list") {
    insertList("check");
    return;
  }
  if (!clearCurrentParagraph()) {
    return;
  }
  if (kind === "table") {
    editor.dispatchCommand(INSERT_TABLE_COMMAND, {
      columns: "3",
      includeHeaders: true,
      rows: "3",
    });
    return;
  }
  editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined);
};

const matchesQuery = (option: SlashCommandOption, query: string): boolean => {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return [
    option.definition.label,
    option.definition.description,
    ...option.definition.keywords,
  ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
};

export const filterSlashCommandDefinitions = (query: string): readonly SlashCommandDefinition[] => {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return SLASH_COMMAND_DEFINITIONS;
  }

  return SLASH_COMMAND_DEFINITIONS.filter((definition) => {
    return [definition.label, definition.description, ...definition.keywords].some((value) => {
      return value.toLocaleLowerCase().includes(normalizedQuery);
    });
  });
};

export function SlashCommandPlugin() {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState<string | null>(null);
  const options = useMemo(() => {
    return SLASH_COMMAND_DEFINITIONS.map((definition) => new SlashCommandOption(definition));
  }, []);
  const filteredOptions = useMemo(() => {
    return options.filter((option) => matchesQuery(option, query ?? ""));
  }, [options, query]);

  const handleSelectOption = useCallback(
    (option: SlashCommandOption, _textNode: TextNode | null, closeMenu: () => void): void => {
      editor.update(
        () => {
          insertSlashCommand(editor, option);
          closeMenu();
        },
        { discrete: true },
      );
    },
    [editor],
  );

  return (
    <LexicalTypeaheadMenuPlugin
      anchorClassName="z-30"
      onQueryChange={setQuery}
      onSelectOption={handleSelectOption}
      options={filteredOptions}
      triggerFn={getSlashCommandMatch}
      menuRenderFn={(
        anchorElementRef,
        { options: menuOptions, selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
      ) => {
        if (!anchorElementRef.current) {
          return null;
        }

        return (
          <Popover.Root modal={false} open>
            <Popover.Portal>
              <Popover.Positioner
                align="start"
                anchor={getSlashCommandMenuAnchor(anchorElementRef.current)}
                collisionAvoidance={{
                  align: "shift",
                  fallbackAxisSide: "none",
                  side: "flip",
                }}
                collisionPadding={12}
                side="bottom"
                sideOffset={SLASH_COMMAND_ANCHOR_GAP_PX}
              >
                <Popover.Popup
                  aria-label="Insert block"
                  className="max-h-80 w-72 overflow-y-auto rounded-xl border border-[var(--color-memora-border)] bg-[var(--color-memora-surface)] p-1.5 shadow-[0_16px_40px_-24px_rgba(34,33,29,0.45)] outline-none"
                  finalFocus={false}
                  id="typeahead-menu"
                  initialFocus={false}
                  role="listbox"
                >
                  {menuOptions.length > 0 ? (
                    menuOptions.map((option, index) => {
                      const IconComponent = option.definition.icon;
                      const isSelected = selectedIndex === index;
                      return (
                        <button
                          key={option.key}
                          ref={option.setRefElement}
                          aria-selected={isSelected}
                          className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${
                            isSelected
                              ? "bg-[var(--color-memora-hover)] text-[var(--color-memora-text-strong)]"
                              : "text-[var(--color-memora-text)] hover:bg-[var(--color-memora-hover-strong)]"
                          }`}
                          id={`typeahead-item-${index}`}
                          onClick={() => selectOptionAndCleanUp(option)}
                          onMouseEnter={() => setHighlightedIndex(index)}
                          role="option"
                          tabIndex={-1}
                          type="button"
                        >
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-memora-surface-muted)] text-[var(--color-memora-text-muted)]">
                            <IconComponent aria-hidden="true" size={16} weight="bold" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium">
                              {option.definition.label}
                            </span>
                            <span className="block truncate text-xs text-[var(--color-memora-text-soft)]">
                              {option.definition.description}
                            </span>
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <p className="px-2.5 py-3 text-sm text-[var(--color-memora-text-soft)]">
                      No matching blocks
                    </p>
                  )}
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        );
      }}
    />
  );
}
