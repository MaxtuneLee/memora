import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createListNode,
  $isListItemNode,
  $isListNode,
  type ListItemNode,
  type ListNode,
  type ListType,
} from "@lexical/list";
import { $isHeadingNode, $isQuoteNode } from "@lexical/rich-text";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  $isRootOrShadowRoot,
  $isTextNode,
  COLLABORATION_TAG,
  COMMAND_PRIORITY_HIGH,
  HISTORIC_TAG,
  INDENT_CONTENT_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_TAB_COMMAND,
  OUTDENT_CONTENT_COMMAND,
  mergeRegister,
  type ElementNode,
  type LexicalNode,
} from "lexical";

const TASK_MARKER_REGEXP = /^\[([ xX])\] $/;

const $getCollapsedSelection = () => {
  const selection = $getSelection();
  return $isRangeSelection(selection) && selection.isCollapsed() ? selection : null;
};

const $findListItem = (node: LexicalNode): ListItemNode | null => {
  let current: LexicalNode | null = node;
  while (current) {
    if ($isListItemNode(current)) {
      return current;
    }
    current = current.getParent();
  }
  return null;
};

const $isCaretAtStartOf = (element: ElementNode): boolean => {
  const selection = $getCollapsedSelection();
  if (!selection) {
    return false;
  }

  const { anchor } = selection;
  if (anchor.offset !== 0) {
    return false;
  }

  let node: LexicalNode | null = anchor.getNode();
  while (node && !node.is(element)) {
    if (node.getPreviousSibling() !== null) {
      return false;
    }
    node = node.getParent();
  }
  return node !== null;
};

// A list item nested under another item lives in a list inside a wrapper item.
const $isNestedListItem = (item: ListItemNode): boolean => {
  const list = item.getParent();
  return $isListNode(list) && $isListItemNode(list.getParent());
};

// Moves `item` out of its list into `replacement`, keeping the items after it in a list of the
// same type so the document order does not change.
const $splitListAt = (item: ListItemNode, replacement: ElementNode): void => {
  const list = item.getParent<ListNode>();
  if (!$isListNode(list)) {
    return;
  }

  const followingItems = item.getNextSiblings();
  if (followingItems.length > 0) {
    const firstFollowing = followingItems[0];
    const start = $isListItemNode(firstFollowing) ? firstFollowing.getValue() : 1;
    const followingList = $createListNode(list.getListType(), start);
    followingList.append(...followingItems);
    list.insertAfter(followingList);
  }

  list.insertAfter(replacement);
  item.remove();
  if (list.getChildrenSize() === 0) {
    list.remove();
  }
};

const $convertListItemToParagraph = (item: ListItemNode): void => {
  const paragraph = $createParagraphNode();
  paragraph.append(...item.getChildren());
  $splitListAt(item, paragraph);
  paragraph.selectStart();
};

const $convertListItemToTask = (item: ListItemNode, checked: boolean): void => {
  const list = item.getParent<ListNode>();
  if (!$isListNode(list)) {
    return;
  }

  if (list.getChildrenSize() === 1) {
    list.setListType("check");
    item.setChecked(checked);
    return;
  }

  const taskList = $createListNode("check" satisfies ListType);
  $splitListAt(item, taskList);
  taskList.append(item);
  item.setChecked(checked);
};

const $handleBackspaceAtBlockStart = (): boolean => {
  const selection = $getCollapsedSelection();
  if (!selection) {
    return false;
  }

  const anchorNode = selection.anchor.getNode();
  const item = $findListItem(anchorNode);
  if (item && $isCaretAtStartOf(item)) {
    if ($isNestedListItem(item)) {
      item.setIndent(Math.max(item.getIndent() - 1, 0));
      return true;
    }
    $convertListItemToParagraph(item);
    return true;
  }

  const block = anchorNode.getTopLevelElement();
  if (
    ($isHeadingNode(block) || $isQuoteNode(block)) &&
    $isRootOrShadowRoot(block.getParent()) &&
    $isCaretAtStartOf(block)
  ) {
    const paragraph = $createParagraphNode();
    paragraph.append(...block.getChildren());
    block.replace(paragraph);
    paragraph.selectStart();
    return true;
  }

  return false;
};

export function MarkdownKeyboardPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        (event) => {
          if (!$handleBackspaceAtBlockStart()) {
            return false;
          }
          event.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_TAB_COMMAND,
        (event) => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            return false;
          }

          const items = [selection.anchor.getNode(), selection.focus.getNode()].map($findListItem);
          if (items.some((item) => item === null)) {
            return false;
          }

          event.preventDefault();
          return editor.dispatchCommand(
            event.shiftKey ? OUTDENT_CONTENT_COMMAND : INDENT_CONTENT_COMMAND,
            undefined,
          );
        },
        COMMAND_PRIORITY_HIGH,
      ),
      // "- [ ] " typed in a new list item: the "- " already made a bulleted list, so turn the
      // item into a task when "[ ] " or "[x] " follows.
      editor.registerUpdateListener(({ dirtyLeaves, tags }) => {
        if (tags.has(HISTORIC_TAG) || tags.has(COLLABORATION_TAG) || editor.isComposing()) {
          return;
        }

        editor.getEditorState().read(() => {
          const selection = $getCollapsedSelection();
          const anchorNode = selection?.anchor.getNode();
          if (!selection || !$isTextNode(anchorNode) || !dirtyLeaves.has(anchorNode.getKey())) {
            return;
          }

          const item = $findListItem(anchorNode);
          const list = item?.getParent();
          if (
            !item ||
            !$isListNode(list) ||
            list.getListType() === "check" ||
            !anchorNode.is(item.getFirstChild())
          ) {
            return;
          }

          const text = anchorNode.getTextContent();
          const marker = text.slice(0, selection.anchor.offset).match(TASK_MARKER_REGEXP);
          if (!marker) {
            return;
          }

          const itemKey = item.getKey();
          const checked = marker[1]?.toLowerCase() === "x";
          editor.update(() => {
            const latestItem = $findListItem(anchorNode.getLatest());
            const textNode = anchorNode.getLatest();
            if (!latestItem || latestItem.getKey() !== itemKey) {
              return;
            }
            const rest = textNode.getTextContent().slice(marker[0].length);
            if (rest) {
              textNode.setTextContent(rest);
            } else {
              textNode.remove();
            }
            $convertListItemToTask(latestItem, checked);
            if (rest) {
              textNode.select(0, 0);
            } else {
              latestItem.selectStart();
            }
          });
        });
      }),
    );
  }, [editor]);

  return null;
}
