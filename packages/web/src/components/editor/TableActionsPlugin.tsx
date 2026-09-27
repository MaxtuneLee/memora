import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Menu } from "@base-ui/react/menu";
import * as stylex from "@stylexjs/stylex";
import {
  ColumnsPlusLeftIcon,
  ColumnsPlusRightIcon,
  DotsThreeIcon,
  RowsPlusBottomIcon,
  RowsPlusTopIcon,
  TextAlignCenterIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
  TrashIcon,
  type Icon,
} from "@phosphor-icons/react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createTableCellNode,
  $deleteTableColumnAtSelection,
  $deleteTableRowAtSelection,
  $findCellNode,
  $findTableNode,
  $getTableColumnIndexFromTableCellNode,
  $insertTableColumnAtSelection,
  $insertTableRowAtSelection,
  $isTableCellNode,
  $isTableRowNode,
  $isTableSelection,
  TableCellHeaderStates,
  TableNode,
  type TableCellNode,
} from "@lexical/table";
import {
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isRootOrShadowRoot,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_HIGH,
  KEY_ENTER_COMMAND,
  KEY_TAB_COMMAND,
  mergeRegister,
  type LexicalEditor,
  type NodeKey,
} from "lexical";

import {
  $applyTableAlignments,
  $createMarkdownTableNode,
  $getInlineMarkdown,
  $getTableAlignments,
  $setTableAlignments,
  parseMarkdownTableLines,
  type MarkdownTableAlignment,
} from "@/components/editor/lexical/imageMarkdownTransformer";
import { tokens } from "../../styles/stylex.stylex";

const TRIGGER_SIZE = 24;
const TRIGGER_INSET = 4;

const styles = stylex.create({
  trigger: {
    alignItems: "center",
    backgroundColor: { default: tokens.surface, ":hover": tokens.hover },
    borderColor: tokens.border,
    borderRadius: 6,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: tokens.shadowMedium,
    color: tokens.textMuted,
    display: "flex",
    height: TRIGGER_SIZE,
    justifyContent: "center",
    position: "fixed",
    width: TRIGGER_SIZE,
    zIndex: 20,
    ":focus-visible": { outline: `2px solid ${tokens.oliveSoft}`, outlineOffset: 1 },
  },
  positioner: { zIndex: 30 },
  popup: {
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    borderRadius: 12,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: tokens.shadowMedium,
    minWidth: 200,
    outline: "none",
    padding: 6,
  },
  item: {
    alignItems: "center",
    borderRadius: 8,
    color: tokens.text,
    cursor: "pointer",
    display: "flex",
    fontSize: "0.875rem",
    gap: 8,
    outline: "none",
    paddingBlock: 8,
    paddingInline: 12,
    width: "100%",
    "[data-highlighted]": { backgroundColor: tokens.hover, color: tokens.textStrong },
  },
  deleteItem: {
    "[data-highlighted]": { backgroundColor: tokens.dangerSurface, color: tokens.dangerText },
  },
  icon: { color: tokens.textSoft, flexShrink: 0, height: 16, width: 16 },
  separator: { backgroundColor: tokens.border, height: 1, marginBlock: 4 },
});

type TableAction =
  | "align-center"
  | "align-left"
  | "align-right"
  | "delete-column"
  | "delete-row"
  | "delete-table"
  | "insert-column-left"
  | "insert-column-right"
  | "insert-row-above"
  | "insert-row-below";

interface TableActionItem {
  action: TableAction;
  icon: Icon;
  label: string;
}

const INSERT_ACTIONS: readonly TableActionItem[] = [
  { action: "insert-row-above", icon: RowsPlusTopIcon, label: "Insert row above" },
  { action: "insert-row-below", icon: RowsPlusBottomIcon, label: "Insert row below" },
  { action: "insert-column-left", icon: ColumnsPlusLeftIcon, label: "Insert column left" },
  { action: "insert-column-right", icon: ColumnsPlusRightIcon, label: "Insert column right" },
];

const ALIGN_ACTIONS: readonly TableActionItem[] = [
  { action: "align-left", icon: TextAlignLeftIcon, label: "Align column left" },
  { action: "align-center", icon: TextAlignCenterIcon, label: "Align column center" },
  { action: "align-right", icon: TextAlignRightIcon, label: "Align column right" },
];

const DELETE_ACTIONS: readonly TableActionItem[] = [
  { action: "delete-row", icon: TrashIcon, label: "Delete row" },
  { action: "delete-column", icon: TrashIcon, label: "Delete column" },
  { action: "delete-table", icon: TrashIcon, label: "Delete table" },
];

interface ActiveCell {
  cellKey: NodeKey;
  left: number;
  top: number;
}

const $getSelectedCell = (): TableCellNode | null => {
  const selection = $getSelection();
  if ($isRangeSelection(selection) || $isTableSelection(selection)) {
    return $findCellNode(selection.focus.getNode());
  }

  return null;
};

const isSelectionInCell = (cell: TableCellNode): boolean => {
  const selectedCell = $getSelectedCell();
  const table = $findTableNode(cell);
  return Boolean(selectedCell && table && table.is($findTableNode(selectedCell)));
};

// Markdown tables only have a header row, so keep the first row as the header after rows are
// inserted, deleted, or pasted.
const $normalizeTable = (tableNode: TableNode): void => {
  $normalizeTableHeaders(tableNode);
  $applyTableAlignments(tableNode);
};

const $normalizeTableHeaders = (tableNode: TableNode): void => {
  tableNode.getChildren().forEach((rowNode, rowIndex) => {
    if (!$isTableRowNode(rowNode)) {
      return;
    }

    const headerState =
      rowIndex === 0 ? TableCellHeaderStates.ROW : TableCellHeaderStates.NO_STATUS;
    for (const cellNode of rowNode.getChildren()) {
      if ($isTableCellNode(cellNode) && cellNode.getHeaderStyles() !== headerState) {
        cellNode.setHeaderStyles(headerState, TableCellHeaderStates.BOTH);
      }
    }
  });
};

const $deleteTable = (cell: TableCellNode): void => {
  const table = $findTableNode(cell);
  if (!table) {
    return;
  }

  const nextSibling = table.getNextSibling();
  const previousSibling = table.getPreviousSibling();
  table.remove();
  if (nextSibling) {
    nextSibling.selectStart();
  } else if (previousSibling) {
    previousSibling.selectEnd();
  } else {
    const paragraph = $createParagraphNode();
    $getRoot().append(paragraph);
    paragraph.select();
  }
};

const $runTableAction = (action: TableAction, cellKey: NodeKey): void => {
  const cell = $getNodeByKey(cellKey);
  if (!$isTableCellNode(cell)) {
    return;
  }

  if (!isSelectionInCell(cell)) {
    cell.selectEnd();
  }

  const table = $findTableNode(cell);
  const columnIndex = $getTableColumnIndexFromTableCellNode(cell);
  const updateAlignments = (
    update: (alignments: MarkdownTableAlignment[]) => MarkdownTableAlignment[],
  ): void => {
    if (table) {
      $setTableAlignments(table, update([...$getTableAlignments(table)]));
    }
  };
  const alignColumn = (alignment: MarkdownTableAlignment): void => {
    updateAlignments((alignments) => {
      while (alignments.length <= columnIndex) {
        alignments.push(null);
      }
      alignments[columnIndex] = alignments[columnIndex] === alignment ? null : alignment;
      return alignments;
    });
  };

  switch (action) {
    case "align-left":
      alignColumn("left");
      return;
    case "align-center":
      alignColumn("center");
      return;
    case "align-right":
      alignColumn("right");
      return;
    case "insert-row-above":
      $insertTableRowAtSelection(false);
      return;
    case "insert-row-below":
      $insertTableRowAtSelection(true);
      return;
    case "insert-column-left":
      $insertTableColumnAtSelection(false);
      updateAlignments((alignments) => {
        alignments.splice(columnIndex, 0, null);
        return alignments;
      });
      return;
    case "insert-column-right":
      $insertTableColumnAtSelection(true);
      updateAlignments((alignments) => {
        alignments.splice(columnIndex + 1, 0, null);
        return alignments;
      });
      return;
    case "delete-row":
      $deleteTableRowAtSelection();
      return;
    case "delete-column":
      $deleteTableColumnAtSelection();
      updateAlignments((alignments) => {
        alignments.splice(columnIndex, 1);
        return alignments;
      });
      return;
    case "delete-table":
      $deleteTable(cell);
  }
};

const $isLastCell = (cell: TableCellNode): boolean => {
  const row = cell.getParent();
  const table = $findTableNode(cell);
  return Boolean(
    $isTableRowNode(row) && table && cell.getNextSibling() === null && row.is(table.getLastChild()),
  );
};

// Enter after a typed header row and "| --- | --- |" divider turns the two lines into a table.
const $convertTypedMarkdownTable = (): boolean => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }

  const dividerParagraph = selection.anchor.getNode().getTopLevelElement();
  const headerParagraph = dividerParagraph?.getPreviousSibling();
  if (
    !$isParagraphNode(dividerParagraph) ||
    !$isParagraphNode(headerParagraph) ||
    !$isRootOrShadowRoot(dividerParagraph.getParent())
  ) {
    return false;
  }

  const dividerText = dividerParagraph.getTextContent();
  const isCaretAtEnd = selection.anchor.getNode().is(dividerParagraph)
    ? selection.anchor.offset === dividerParagraph.getChildrenSize()
    : selection.anchor.offset === selection.anchor.getNode().getTextContentSize() &&
      selection.anchor.getNode().is(dividerParagraph.getLastDescendant());
  if (!isCaretAtEnd || !parseMarkdownTableLines([headerParagraph.getTextContent(), dividerText])) {
    return false;
  }

  // Export the header line with its inline formatting; the markdown export reads block children,
  // so the paragraph goes into a detached cell first.
  const placeholder = $createParagraphNode();
  headerParagraph.replace(placeholder);
  const headerContainer = $createTableCellNode();
  headerContainer.append(headerParagraph);
  const header = parseMarkdownTableLines([$getInlineMarkdown(headerContainer), dividerText])?.[0];
  if (!header) {
    placeholder.replace(headerParagraph);
    return false;
  }

  const tableNode = $createMarkdownTableNode([header, header.map(() => "")]);
  placeholder.replace(tableNode);
  dividerParagraph.remove();
  if (!tableNode.getNextSibling()) {
    tableNode.insertAfter($createParagraphNode());
  }
  const bodyRow = tableNode.getChildAtIndex(1);
  const firstBodyCell = $isTableRowNode(bodyRow) ? bodyRow.getFirstChild() : null;
  if ($isTableCellNode(firstBodyCell)) {
    firstBodyCell.selectStart();
  }
  return true;
};

const readActiveCell = (editor: LexicalEditor): ActiveCell | null => {
  return editor.getEditorState().read(() => {
    const cell = $getSelectedCell();
    if (!cell) {
      return null;
    }

    const element = editor.getElementByKey(cell.getKey());
    if (!element) {
      return null;
    }

    const rect = element.getBoundingClientRect();
    return {
      cellKey: cell.getKey(),
      left: rect.right - TRIGGER_SIZE - TRIGGER_INSET,
      top: rect.top + TRIGGER_INSET,
    };
  });
};

export function TableActionsPlugin() {
  const [editor] = useLexicalComposerContext();
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const syncActiveCell = useCallback((): void => {
    const nextCell = readActiveCell(editor);
    setActiveCell((current) => {
      if (
        current?.cellKey === nextCell?.cellKey &&
        current?.left === nextCell?.left &&
        current?.top === nextCell?.top
      ) {
        return current;
      }
      return nextCell;
    });
  }, [editor]);

  useEffect(() => {
    const handleViewportChange = (): void => {
      syncActiveCell();
    };

    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);
    return mergeRegister(
      editor.registerNodeTransform(TableNode, $normalizeTable),
      editor.registerUpdateListener(() => {
        syncActiveCell();
      }),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (event?.shiftKey || !$convertTypedMarkdownTable()) {
            return false;
          }
          event?.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_TAB_COMMAND,
        (event) => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || !selection.isCollapsed() || event.shiftKey) {
            return false;
          }

          const cell = $findCellNode(selection.anchor.getNode());
          if (!cell || !$isLastCell(cell)) {
            return false;
          }

          event.preventDefault();
          $insertTableRowAtSelection(true);
          const table = $findTableNode(cell);
          const lastRow = table?.getLastChild();
          const firstCell = $isTableRowNode(lastRow) ? lastRow.getFirstChild() : null;
          if ($isTableCellNode(firstCell)) {
            firstCell.selectStart();
          }
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      () => {
        window.removeEventListener("scroll", handleViewportChange, true);
        window.removeEventListener("resize", handleViewportChange);
      },
    );
  }, [editor, syncActiveCell]);

  const handleAction = useCallback(
    (action: TableAction): void => {
      if (!activeCell) {
        return;
      }

      editor.update(() => {
        $runTableAction(action, activeCell.cellKey);
      });
      editor.focus();
    },
    [activeCell, editor],
  );

  if (!activeCell) {
    return null;
  }

  const renderItem = ({ action, icon: IconComponent, label }: TableActionItem) => (
    <Menu.Item
      key={action}
      className={
        stylex.props(styles.item, action.startsWith("delete") && styles.deleteItem).className
      }
      onClick={() => {
        handleAction(action);
      }}
    >
      <IconComponent aria-hidden="true" {...stylex.props(styles.icon)} />
      <span>{label}</span>
    </Menu.Item>
  );

  return createPortal(
    <Menu.Root open={isMenuOpen} onOpenChange={setIsMenuOpen}>
      <Menu.Trigger
        aria-label="Table options"
        className={stylex.props(styles.trigger).className}
        onMouseDown={(event) => {
          // Keep the caret in the cell until an action runs.
          event.preventDefault();
        }}
        style={{ left: activeCell.left, top: activeCell.top }}
      >
        <DotsThreeIcon aria-hidden="true" size={16} weight="bold" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          {...stylex.props(styles.positioner)}
          align="end"
          side="bottom"
          sideOffset={4}
        >
          <Menu.Popup {...stylex.props(styles.popup)}>
            {INSERT_ACTIONS.map(renderItem)}
            <Menu.Separator {...stylex.props(styles.separator)} />
            {ALIGN_ACTIONS.map(renderItem)}
            <Menu.Separator {...stylex.props(styles.separator)} />
            {DELETE_ACTIONS.map(renderItem)}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>,
    document.body,
  );
}
