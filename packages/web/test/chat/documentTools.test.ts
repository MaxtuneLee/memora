import { expect, test } from "vite-plus/test";

import {
  applyDocumentEdits,
  createDocumentTools,
  getDocumentToolTarget,
  registerDocumentToolTarget,
  type DocumentToolTarget,
} from "@/lib/chat/tools/documentTools";

const createTarget = (initialText: string): DocumentToolTarget & { text: string } => {
  const target = {
    fileName: "Notes.md",
    text: initialText,
    getText: () => target.text,
    applyText: (nextText: string) => {
      target.text = nextText;
    },
  };
  return target;
};

const getTool = (target: DocumentToolTarget, name: string) => {
  const tool = createDocumentTools(target).find((item) => item.name === name);
  if (!tool) {
    throw new Error(`Missing tool ${name}`);
  }
  return tool;
};

test("applies edits in order when each old text matches once", () => {
  expect(
    applyDocumentEdits("# Title\n\nalpha beta", [
      { old_text: "alpha", new_text: "gamma" },
      { old_text: "# Title", new_text: "# New title" },
    ]),
  ).toEqual({ text: "# New title\n\ngamma beta" });
});

test("keeps replacement text literal", () => {
  expect(applyDocumentEdits("price", [{ old_text: "price", new_text: "$& $1" }])).toEqual({
    text: "$& $1",
  });
});

test("rejects missing, ambiguous, and empty old text without applying anything", () => {
  expect(applyDocumentEdits("a a", [{ old_text: "a", new_text: "b" }])).toEqual({
    error: expect.stringContaining("matches 2 places"),
  });
  expect(applyDocumentEdits("a", [{ old_text: "z", new_text: "b" }])).toEqual({
    error: expect.stringContaining("not found"),
  });
  expect(applyDocumentEdits("a", [{ old_text: "", new_text: "b" }])).toEqual({
    error: expect.stringContaining("empty"),
  });
});

test("edit_document changes the target only when every edit applies", async () => {
  const target = createTarget("one\ntwo");
  const editTool = getTool(target, "edit_document");

  await expect(
    editTool.execute({
      edits: [
        { old_text: "one", new_text: "1" },
        { old_text: "three", new_text: "3" },
      ],
    }),
  ).resolves.toEqual({ error: expect.stringContaining("Edit 2") });
  expect(target.text).toBe("one\ntwo");

  await expect(editTool.execute({ edits: [{ old_text: "two", new_text: "2" }] })).resolves.toEqual({
    appliedEdits: 1,
    fileName: "Notes.md",
  });
  expect(target.text).toBe("one\n2");
});

test("read_document returns a line range", async () => {
  const target = createTarget("a\nb\nc\nd");
  await expect(
    getTool(target, "read_document").execute({ start_line: 2, end_line: 3 }),
  ).resolves.toMatchObject({ content: "b\nc", endLine: 3, startLine: 2, totalLines: 4 });
});

test("write_document replaces the whole document", async () => {
  const target = createTarget("old");
  await getTool(target, "write_document").execute({ content: "# New" });
  expect(target.text).toBe("# New");
});

test("unregistering keeps a newer target for the same session", () => {
  const first = createTarget("1");
  const second = createTarget("2");
  const unregisterFirst = registerDocumentToolTarget("document-chat:a", first);
  const unregisterSecond = registerDocumentToolTarget("document-chat:a", second);
  unregisterFirst();
  expect(getDocumentToolTarget("document-chat:a")).toBe(second);
  unregisterSecond();
  expect(getDocumentToolTarget("document-chat:a")).toBeUndefined();
});
