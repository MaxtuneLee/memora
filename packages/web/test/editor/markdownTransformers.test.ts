import { expect, test } from "vite-plus/test";
import { $createParagraphNode, $createTextNode, $getRoot, createEditor } from "lexical";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  CHECK_LIST,
  TRANSFORMERS,
} from "@lexical/markdown";
import { $createCodeNode } from "@lexical/code";
import { $createLinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";

import { $createCodeFenceNode } from "@/components/editor/lexical/CodeFenceNode";
import { MathNode } from "@/components/editor/lexical/MathNode";
import { MarkdownLinkNode } from "@/components/editor/lexical/MarkdownLinkNode";
import {
  $isMarkdownListItemNode,
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
  getSetextHeadingTag,
  parseHtmlAnchor,
  parseHtmlImage,
  parseInlineMath,
  parseMarkdownLink,
  parseMarkdownLinkedImage,
  parseMathBlock,
  parseMarkdownImage,
  parseMarkdownTableLines,
} from "@/components/editor/lexical/imageMarkdownTransformer";
import {
  WYSIWYG_NODES,
  WYSIWYG_TRANSFORMERS,
  exportWysiwygMarkdown,
  importWysiwygMarkdown,
} from "@/lib/editor/wysiwygMarkdownConfig";

const EDITOR_MARKDOWN_TRANSFORMERS = [CHECK_LIST, ...TRANSFORMERS];
test("parses markdown images without treating an optional title as the src", () => {
  expect(parseMarkdownImage("![](https://example.com/badge.svg)")).toEqual({
    altText: "",
    src: "https://example.com/badge.svg",
  });
  expect(parseMarkdownImage('![logo](https://example.com/logo.png "Logo title")')).toEqual({
    altText: "logo",
    src: "https://example.com/logo.png",
  });
  expect(parseMarkdownImage("![logo](<https://example.com/logo.png> 'Logo title')")).toEqual({
    altText: "logo",
    src: "https://example.com/logo.png",
  });
});

test("parses linked markdown images", () => {
  expect(
    parseMarkdownLinkedImage("[![cover](https://example.com/cover.jpg)](https://example.com)"),
  ).toEqual({
    altText: "cover",
    href: "https://example.com",
    src: "https://example.com/cover.jpg",
  });
  expect(
    parseMarkdownLinkedImage(
      '[![logo](<https://example.com/logo.png> "Logo title")](<https://example.com> "Link title")',
    ),
  ).toEqual({
    altText: "logo",
    href: "https://example.com",
    src: "https://example.com/logo.png",
  });
});

test("parses markdown links", () => {
  expect(parseMarkdownLink("[普通链接](https://github.com)")).toEqual({
    href: "https://github.com",
    text: "普通链接",
  });
  expect(parseMarkdownLink('[普通链接带标题](http://localhost/ "普通链接带标题")')).toEqual({
    href: "http://localhost/",
    text: "普通链接带标题",
    title: "普通链接带标题",
  });
});

test("round trips linked markdown images", () => {
  const markdown = "[![cover](https://example.com/cover.jpg)](https://example.com)";
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

  expect(exportWysiwygMarkdown(editor.getEditorState())).toBe(markdown);
});

test("replaces base link nodes while preserving link attributes", () => {
  const editor = createEditor({
    nodes: WYSIWYG_NODES,
    onError: (error) => {
      throw error;
    },
  });
  let result: {
    isMarkdownLinkNode: boolean;
    rel: string | null;
    target: string | null;
    title: string | null;
    url: string;
  } | null = null;

  editor.update(
    () => {
      const linkNode = $createLinkNode("https://example.com/docs", {
        rel: "noreferrer",
        target: "_blank",
        title: "Documentation",
      });
      linkNode.append($createTextNode("Docs"));
      $getRoot().append($createParagraphNode().append(linkNode));
      result = {
        isMarkdownLinkNode: linkNode instanceof MarkdownLinkNode,
        rel: linkNode.getRel(),
        target: linkNode.getTarget(),
        title: linkNode.getTitle(),
        url: linkNode.getURL(),
      };
    },
    { discrete: true },
  );

  expect(result).toEqual({
    isMarkdownLinkNode: true,
    rel: "noreferrer",
    target: "_blank",
    title: "Documentation",
    url: "https://example.com/docs",
  });
});

test("parses safe raw html anchor and image tags", () => {
  expect(parseHtmlAnchor('<a href="https://oschina.net">hhh</a>')).toEqual({
    href: "https://oschina.net",
    text: "hhh",
  });
  expect(
    parseHtmlImage(
      '<img src="https://pandao.github.io/editor.md/images/logos/editormd-logo-180x180.png">',
    ),
  ).toEqual({
    altText: "",
    src: "https://pandao.github.io/editor.md/images/logos/editormd-logo-180x180.png",
  });
});

test("imports safe raw html anchor and image tags as lexical nodes", () => {
  const editor = createEditor({
    nodes: WYSIWYG_NODES,
    onError: (error) => {
      throw error;
    },
  });

  editor.update(
    () => {
      importWysiwygMarkdown(
        '<a href="https://oschina.net">hhh</a>\n<img src="https://pandao.github.io/editor.md/images/logos/editormd-logo-180x180.png">',
      );
    },
    { discrete: true },
  );

  expect(exportWysiwygMarkdown(editor.getEditorState())).toBe(
    "[hhh](https://oschina.net)\n![](https://pandao.github.io/editor.md/images/logos/editormd-logo-180x180.png)",
  );
});

test("parses inline and single-line math formulas", () => {
  expect(parseInlineMath("行内的公式$$E=mc^2$$行内的公式")).toEqual({
    delimiter: "$$",
    formula: "E=mc^2",
  });
  expect(parseInlineMath("行内的公式$\\lambda_i$行内的公式")).toEqual({
    delimiter: "$",
    formula: "\\lambda_i",
  });
  expect(parseMathBlock("$$x > y$$")).toEqual({
    formula: "x > y",
  });
});

test("parses and round trips multiline block formulas", () => {
  const formula = "\\begin{aligned}\nx &= y + 1 \\\\\ny &= 2\n\\end{aligned}";
  const markdown = `$$\n${formula}\n$$`;
  expect(parseMathBlock(markdown)).toEqual({ formula });

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

  expect(exportWysiwygMarkdown(editor.getEditorState())).toBe(markdown);
});

test("preserves fenced block math when the formula has one line", () => {
  const markdown = "$$\nx + y\n$$";
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

  expect(exportWysiwygMarkdown(editor.getEditorState())).toBe(markdown);
});

test("preserves blank lines inside fenced block math", () => {
  const markdown = "$$\n\nx + y\n\n$$";
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

  expect(exportWysiwygMarkdown(editor.getEditorState())).toBe(markdown);
});

test("round trips inline and single-line math formulas", () => {
  const markdown = "行内的公式$$E=mc^2$$行内的公式\n$$x > y$$";
  const editor = createEditor({
    nodes: [MathNode],
    onError: (error) => {
      throw error;
    },
  });
  const transformers = [MATH_BLOCK_TRANSFORMER, INLINE_MATH_TRANSFORMER, ...TRANSFORMERS];

  editor.update(
    () => {
      $convertFromMarkdownString(markdown, transformers, $getRoot());
    },
    { discrete: true },
  );

  expect(editor.getEditorState().read(() => $convertToMarkdownString(transformers))).toBe(
    "行内的公式$$E=mc^2$$行内的公式\n\n$$x > y$$",
  );
});

test("round trips single-dollar inline math without escaping its TeX source", () => {
  const markdown =
    "The `i`-th subchannel has gain $\\lambda_i$ and allocated power $p_i$.\n\n" +
    "For the rank-one case, $rank(H_{eq})=1$ and $P_t^{(SEB)} = 2.066e-12$.";
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

  expect(exportWysiwygMarkdown(editor.getEditorState())).toBe(markdown);
});

test("updates a formula without changing its display mode", () => {
  const editor = createEditor({
    nodes: WYSIWYG_NODES,
    onError: (error) => {
      throw error;
    },
  });
  let displayMode = true;

  editor.update(
    () => {
      const node = new MathNode("a+b", false);
      $getRoot().append($createParagraphNode().append(node));
      node.setFormula("a^2+b^2=c^2");
      displayMode = node.getDisplayMode();
    },
    { discrete: true },
  );

  expect(displayMode).toBe(false);
  expect(exportWysiwygMarkdown(editor.getEditorState())).toContain("$$a^2+b^2=c^2$$");
});

test("exports editable code fence nodes as a single fenced code block", () => {
  const editor = createEditor({
    nodes: WYSIWYG_NODES,
    onError: (error) => {
      throw error;
    },
  });

  editor.update(
    () => {
      const codeNode = $createCodeNode("javascript");
      codeNode.append($createTextNode('function test() {\n  console.log("Hello world!");\n}'));
      $getRoot().append(
        $createCodeFenceNode("open", "```javascript"),
        codeNode,
        $createCodeFenceNode("close", "```"),
      );
    },
    { discrete: true },
  );

  expect(exportWysiwygMarkdown(editor.getEditorState())).toBe(
    '```javascript\nfunction test() {\n  console.log("Hello world!");\n}\n```',
  );
});

test("round trips inline emphasis, strong, strong emphasis, and strikethrough text", () => {
  const markdown = `~~删除线~~
*斜体字*      *斜体字*
**粗体**  **粗体**
***粗斜体*** ***粗斜体***`;
  const editor = createEditor({
    onError: (error) => {
      throw error;
    },
  });

  editor.update(
    () => {
      $convertFromMarkdownString(markdown, TRANSFORMERS, $getRoot());
    },
    { discrete: true },
  );

  const exportedMarkdown = editor
    .getEditorState()
    .read(() => $convertToMarkdownString(TRANSFORMERS));

  expect(exportedMarkdown).toContain("~~删除线~~");
  expect(exportedMarkdown).toContain("*斜体字*      *斜体字*");
  expect(exportedMarkdown).toContain("**粗体**  **粗体**");
  expect(exportedMarkdown).toContain("***粗斜体*** ***粗斜体***");
});

test("round trips consecutive empty-alt markdown images", () => {
  const markdown =
    "![](https://img.shields.io/github/stars/pandao/editor.md.svg) ![](https://img.shields.io/github/forks/pandao/editor.md.svg) ![](https://img.shields.io/github/tag/pandao/editor.md.svg) ![](https://img.shields.io/github/release/pandao/editor.md.svg) ![](https://img.shields.io/github/issues/pandao/editor.md.svg) ![](https://img.shields.io/bower/v/editor.md.svg)";
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

  expect(exportWysiwygMarkdown(editor.getEditorState())).toBe(markdown);
});

test("keeps the production custom transformer order", () => {
  expect(WYSIWYG_TRANSFORMERS.slice(2, 14)).toEqual([
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
  ]);
});

test("round trips nested unordered, ordered, and task lists", () => {
  const markdown = `#### 无序列表（减号）Unordered Lists (-)

- 列表一
- 列表二
- 列表三

#### 无序列表（星号）Unordered Lists (*)

* 列表一
* 列表二
* 列表三

#### 无序列表（加号和嵌套）Unordered Lists (+)

+ 列表一
+ 列表二
    + 列表二-1
    + 列表二-2
    + 列表二-3
+ 列表三
    * 列表一
    * 列表二
    * 列表三

#### 有序列表 Ordered Lists (-)

1. 第一行
2. 第二行
3. 第三行

#### GFM task list

- [x] GFM task list 1
- [x] GFM task list 2
- [ ] GFM task list 3
    - [ ] GFM task list 3-1
    - [ ] GFM task list 3-2
    - [ ] GFM task list 3-3
- [ ] GFM task list 4
    - [ ] GFM task list 4-1
    - [ ] GFM task list 4-2`;
  const editor = createEditor({
    nodes: [HeadingNode, ListNode, ListItemNode, QuoteNode],
    onError: (error) => {
      throw error;
    },
  });

  editor.update(
    () => {
      $convertFromMarkdownString(markdown, EDITOR_MARKDOWN_TRANSFORMERS, $getRoot());
    },
    { discrete: true },
  );

  const exportedMarkdown = editor
    .getEditorState()
    .read(() => $convertToMarkdownString(EDITOR_MARKDOWN_TRANSFORMERS));
  expect(exportedMarkdown).toContain("    - 列表二-1");
  expect(exportedMarkdown).toContain("    - 列表一");
  expect(exportedMarkdown).toContain("1. 第一行");
  expect(exportedMarkdown).toContain("- [x] GFM task list 1");
  expect(exportedMarkdown).toContain("    - [ ] GFM task list 3-1");
  expect(exportedMarkdown).toContain("    - [ ] GFM task list 4-2");
});

test("keeps unordered list item text after source edits import into wysiwyg nodes", () => {
  const markdown = `#### 无序列表（星号）Unordered Lists (*)

* 你好
* 列表二已编辑
* 列表三`;
  const editor = createEditor({
    nodes: [HeadingNode, ListNode, ListItemNode, MarkdownListItemNode],
    onError: (error) => {
      throw error;
    },
  });
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
  });

  editor.update(
    () => {
      $convertFromMarkdownString(markdown, EDITOR_MARKDOWN_TRANSFORMERS, $getRoot());
    },
    { discrete: true },
  );

  const exportedMarkdown = editor
    .getEditorState()
    .read(() => $convertToMarkdownString(EDITOR_MARKDOWN_TRANSFORMERS));

  expect(exportedMarkdown).toContain("* 你好");
  expect(exportedMarkdown).toContain("* 列表二已编辑");
  expect(exportedMarkdown).toContain("* 列表三");
});

test("parses gfm pipe tables with or without outer pipes", () => {
  expect(
    parseMarkdownTableLines([
      "First Header  | Second Header",
      "------------- | -------------",
      "Content Cell  | Content Cell",
      "Content Cell  | Content Cell",
    ]),
  ).toEqual([
    ["First Header", "Second Header"],
    ["Content Cell", "Content Cell"],
    ["Content Cell", "Content Cell"],
  ]);

  expect(
    parseMarkdownTableLines([
      "| Function name | Description |",
      "| --- | --- |",
      "| `help()` | Display the help window. |",
    ]),
  ).toEqual([
    ["Function name", "Description"],
    ["`help()`", "Display the help window."],
  ]);
});

test("detects commonmark setext heading underlines", () => {
  expect(getSetextHeadingTag("This is an H1", "=============")).toBe("h1");
  expect(getSetextHeadingTag("This is an H2", "-------------")).toBe("h2");
  expect(getSetextHeadingTag("", "-------------")).toBeNull();
  expect(getSetextHeadingTag("not a heading", "--")).toBeNull();
});
