import { expect, test } from "vite-plus/test";

import {
  createTodoTask,
  getNextComposerStateAfterEscape,
  getNextComposerStateAfterSubmit,
  splitTodoTasks,
  toggleTodoTask,
} from "@/components/dashboard/todoPanelState";
import type { TodoTask } from "@/components/dashboard/todoMarkdown";

test("creates a new open todo task from trimmed multiline text", () => {
  expect(createTodoTask("  Draft the parser\nwith a second line  ")).toMatchObject({
    text: "Draft the parser\nwith a second line",
    done: false,
  });
});

test("returns null when attempting to create an empty todo task", () => {
  expect(createTodoTask("   \n  ")).toBeNull();
});

test("toggles the matching task without mutating unrelated items", () => {
  const tasks: TodoTask[] = [
    {
      id: "open-1",
      text: "Draft the parser",
      done: false,
    },
    {
      id: "done-1",
      text: "Replace the static card",
      done: true,
    },
  ];

  const toggled = toggleTodoTask(tasks, "open-1");

  expect(toggled).toEqual([
    {
      id: "open-1",
      text: "Draft the parser",
      done: true,
    },
    {
      id: "done-1",
      text: "Replace the static card",
      done: true,
    },
  ]);
  expect(tasks[0]?.done).toBe(false);
});

test("splits tasks into open and done sections while preserving order", () => {
  const tasks: TodoTask[] = [
    {
      id: "open-1",
      text: "First open task",
      done: false,
    },
    {
      id: "done-1",
      text: "Completed task",
      done: true,
    },
    {
      id: "open-2",
      text: "Second open task",
      done: false,
    },
  ];

  expect(splitTodoTasks(tasks)).toEqual({
    open: [
      {
        id: "open-1",
        text: "First open task",
        done: false,
      },
      {
        id: "open-2",
        text: "Second open task",
        done: false,
      },
    ],
    done: [
      {
        id: "done-1",
        text: "Completed task",
        done: true,
      },
    ],
  });
});

test("closes the inline composer after a successful submit", () => {
  expect(
    getNextComposerStateAfterSubmit({
      isComposerOpen: true,
      submitted: true,
    }),
  ).toBe(false);
});

test("keeps the inline composer open when submit does not happen", () => {
  expect(
    getNextComposerStateAfterSubmit({
      isComposerOpen: true,
      submitted: false,
    }),
  ).toBe(true);
});

test("closes the inline composer when escape is pressed", () => {
  expect(getNextComposerStateAfterEscape()).toBe(false);
});
