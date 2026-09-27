import { expect, test } from "vite-plus/test";
import { $getRoot, createEditor } from "lexical";
import { $isListItemNode, $isListNode } from "@lexical/list";
import {
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  TableCellHeaderStates,
} from "@lexical/table";

import { preflightMarkdownForWysiwyg } from "@/lib/editor/markdownRoundTripGuard";
import {
  normalizeMarkdownListIndent,
  restoreMarkdownListIndent,
} from "@/lib/editor/markdownListIndent";
import {
  WYSIWYG_NODES,
  exportWysiwygMarkdown,
  importWysiwygMarkdown,
} from "@/lib/editor/wysiwygMarkdownConfig";

const createMarkdownEditor = (markdown: string) => {
  const editor = createEditor({
    nodes: WYSIWYG_NODES,
    onError: (error) => {
      throw error;
    },
  });
  editor.update(
    () => {
      importWysiwygMarkdown(markdown);
    },
    { discrete: true },
  );
  return editor;
};

const roundTrip = (markdown: string): string => {
  return exportWysiwygMarkdown(createMarkdownEditor(markdown).getEditorState());
};

test.each([
  ["2-space nested lists", "- a\n  - b\n    - c\n- d"],
  ["3-space nested ordered lists", "1. a\n   1. b\n2. c"],
  ["compact tables with alignment", "| a | b | c |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |"],
  ["padded tables", "| Name | Age |\n| ---- | --- |\n| Bob  | 3   |"],
  [
    "padded tables with alignment",
    "| Name | Age | Mid |\n| :--- | --: | :-: |\n| Bob  |   3 |  x  |",
  ],
  ["padded tables with wide characters", "| 名字 | Age |\n| ---- | --- |\n| 张三 | 3   |"],
  [
    "inline markdown in table cells",
    "| a | b |\n| --- | --- |\n| `x` | **y** and [z](https://a.com) |",
  ],
  ["escaped pipes in table cells", "| a | b |\n| --- | --- |\n| x \\| y | z |"],
  ["line breaks in table cells", "| a | b |\n| --- | --- |\n| one<br>two | z |"],
  ["star and underscore rules", "a\n\n***\n\nb\n\n___\n\nc"],
  ["setext headings", "Title\n=====\n\nSub\n---\n\nbody"],
  ["front matter", "---\ntitle: Notes\ntags: [a, b]\n---\n\n# Heading\n\n---\n\nend"],
])("round trips %s", (_name, markdown) => {
  expect(roundTrip(markdown)).toBe(markdown);
  expect(preflightMarkdownForWysiwyg(markdown).safe).toBe(true);
});

test("keeps nested list structure written with 2-space indentation", () => {
  const editor = createMarkdownEditor("- a\n  - b\n- c");
  editor.getEditorState().read(() => {
    const list = $getRoot().getFirstChild();
    expect($isListNode(list)).toBe(true);
    const items = $isListNode(list) ? list.getChildren() : [];
    expect(items).toHaveLength(3);
    const nestedWrapper = items[1];
    expect($isListItemNode(nestedWrapper) && $isListNode(nestedWrapper.getFirstChild())).toBe(true);
  });
});

test("keeps uppercase task markers checked", () => {
  expect(roundTrip("- [X] done\n- [ ] todo")).toBe("- [x] done\n- [ ] todo");
});

test("imports only the first table row as a header", () => {
  const editor = createMarkdownEditor("| a | b |\n| --- | --- |\n| 1 | 2 |");
  editor.getEditorState().read(() => {
    const table = $getRoot().getFirstChild();
    expect($isTableNode(table)).toBe(true);
    const headerStates = ($isTableNode(table) ? table.getChildren() : []).map((row) => {
      return ($isTableRowNode(row) ? row.getChildren() : []).map((cell) => {
        return $isTableCellNode(cell) ? cell.getHeaderStyles() : null;
      });
    });
    expect(headerStates).toEqual([
      [TableCellHeaderStates.ROW, TableCellHeaderStates.ROW],
      [TableCellHeaderStates.NO_STATUS, TableCellHeaderStates.NO_STATUS],
    ]);
  });
});

test("does not steal the selection when importing a horizontal rule", () => {
  const editor = createMarkdownEditor("a\n\n---\n\nb");
  editor.getEditorState().read(() => {
    expect(editor.getEditorState()._selection).toBeNull();
  });
});

test("normalizes list indentation outside fenced code only", () => {
  const markdown = "- a\n  - b\n\n```\n  - not a list\n```";
  const normalized = normalizeMarkdownListIndent(markdown);
  expect(normalized).toEqual({
    indentWidth: 2,
    markdown: "- a\n    - b\n\n```\n  - not a list\n```",
  });
  expect(restoreMarkdownListIndent(normalized.markdown, normalized.indentWidth)).toBe(markdown);
});

test("leaves indented items without an open list untouched", () => {
  expect(normalizeMarkdownListIndent("text\n\n    - code").markdown).toBe("text\n\n    - code");
});

test("does not treat a leading rule as front matter", () => {
  const markdown = "---\n\nIntro text\n\n---\n\nend";
  const editor = createMarkdownEditor(markdown);
  editor.getEditorState().read(() => {
    expect($getRoot().getTextContent()).toContain("Intro text");
  });
  expect(roundTrip(markdown)).toBe(markdown);
});
