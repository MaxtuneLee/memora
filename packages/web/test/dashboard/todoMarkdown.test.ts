import { expect, test } from "vite-plus/test";

import {
  TODO_DOCUMENT_NAME,
  parseTodoMarkdown,
  serializeTodoMarkdown,
} from "@/components/dashboard/todoMarkdown";

test("serializes an empty todo document into the canonical markdown shape", () => {
  expect(serializeTodoMarkdown([])).toBe(`# ${TODO_DOCUMENT_NAME}

## Open

## Done
`);
});

test("parses open and done items from the canonical todo sections", () => {
  const tasks = parseTodoMarkdown(`# ${TODO_DOCUMENT_NAME}

## Open
- [ ] Draft the storage parser

## Done
- [x] Replace the static dashboard card
`);

  expect(tasks).toHaveLength(2);
  expect(tasks[0]).toMatchObject({
    text: "Draft the storage parser",
    done: false,
  });
  expect(tasks[1]).toMatchObject({
    text: "Replace the static dashboard card",
    done: true,
  });
});

test("preserves multiline task bodies while parsing and serializing", () => {
  const markdown = `# ${TODO_DOCUMENT_NAME}

## Open
- [ ] Multi-line item
  continues on the second line
  
  and keeps a paragraph break

## Done
`;

  const tasks = parseTodoMarkdown(markdown);

  expect(tasks).toHaveLength(1);
  expect(tasks[0]?.text).toBe(
    "Multi-line item\ncontinues on the second line\n\nand keeps a paragraph break",
  );
  expect(serializeTodoMarkdown(tasks)).toBe(markdown);
});

test("ignores content outside of the open and done todo sections", () => {
  const tasks = parseTodoMarkdown(`# Notes

This intro should be ignored.

## Open
- [ ] Keep this task

### Nested
- [ ] Ignore this nested task

## Done
- [x] And this one

Footer text.
`);

  expect(tasks).toHaveLength(2);
  expect(tasks.map((task) => task.text)).toEqual([
    "Keep this task",
    "And this one",
  ]);
});
