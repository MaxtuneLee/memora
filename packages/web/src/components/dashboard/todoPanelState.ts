import type { TodoTask } from "./todoMarkdown";

const createTaskId = (): string => {
  return `todo-${crypto.randomUUID()}`;
};

export const createTodoTask = (draft: string): TodoTask | null => {
  const text = draft.trim();
  if (!text) {
    return null;
  }

  return {
    id: createTaskId(),
    text,
    done: false,
  };
};

export const toggleTodoTask = (tasks: TodoTask[], taskId: string): TodoTask[] => {
  return tasks.map((task) => {
    if (task.id !== taskId) {
      return task;
    }

    return {
      ...task,
      done: !task.done,
    };
  });
};

export const splitTodoTasks = (tasks: TodoTask[]): { open: TodoTask[]; done: TodoTask[] } => {
  return tasks.reduce(
    (groups, task) => {
      if (task.done) {
        groups.done.push(task);
      } else {
        groups.open.push(task);
      }

      return groups;
    },
    {
      open: [] as TodoTask[],
      done: [] as TodoTask[],
    },
  );
};

export const getNextComposerStateAfterSubmit = ({
  isComposerOpen,
  submitted,
}: {
  isComposerOpen: boolean;
  submitted: boolean;
}): boolean => {
  return submitted ? false : isComposerOpen;
};

export const getNextComposerStateAfterEscape = (): boolean => {
  return false;
};
