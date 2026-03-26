export const TODO_DOCUMENT_NAME = "Today Tasks";
export const TODO_OPEN_HEADING = "## Open";
export const TODO_DONE_HEADING = "## Done";

export interface TodoTask {
  id: string;
  text: string;
  done: boolean;
}

const createTaskId = (text: string, done: boolean, index: number): string => {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 24);

  return `${done ? "done" : "open"}-${index}-${normalized || "task"}`;
};

export const parseTodoMarkdown = (markdown: string): TodoTask[] => {
  const tasks: TodoTask[] = [];
  const lines = markdown.split(/\r?\n/);
  let currentSection: "open" | "done" | null = null;
  let currentTaskLines: string[] | null = null;
  let currentTaskDone = false;

  const commitTask = () => {
    if (!currentTaskLines) {
      return;
    }

    const text = currentTaskLines.join("\n").trim();
    if (text) {
      tasks.push({
        id: createTaskId(text, currentTaskDone, tasks.length),
        text,
        done: currentTaskDone,
      });
    }

    currentTaskLines = null;
  };

  for (const line of lines) {
    if (line === TODO_OPEN_HEADING) {
      commitTask();
      currentSection = "open";
      continue;
    }

    if (line === TODO_DONE_HEADING) {
      commitTask();
      currentSection = "done";
      continue;
    }

    if (line.startsWith("#")) {
      commitTask();
      currentSection = null;
      continue;
    }

    const taskMatch = line.match(/^- \[( |x)\] ?(.*)$/);
    if (currentSection && taskMatch) {
      commitTask();
      currentTaskDone = taskMatch[1] === "x";
      currentTaskLines = [taskMatch[2] ?? ""];
      continue;
    }

    if (currentTaskLines) {
      if (line === "") {
        currentTaskLines.push("");
        continue;
      }

      if (line.startsWith("  ")) {
        currentTaskLines.push(line.slice(2));
        continue;
      }
    }

    commitTask();
  }

  commitTask();

  return tasks;
};

export const serializeTodoMarkdown = (tasks: TodoTask[]): string => {
  const renderSection = (done: boolean): string[] => {
    return tasks
      .filter((task) => task.done === done)
      .flatMap((task) => {
        const lines = task.text.split("\n");
        const [firstLine = "", ...restLines] = lines;

        return [`- [${done ? "x" : " "}] ${firstLine}`, ...restLines.map((line) => `  ${line}`)];
      });
  };

  return [
    `# ${TODO_DOCUMENT_NAME}`,
    "",
    TODO_OPEN_HEADING,
    ...renderSection(false),
    "",
    TODO_DONE_HEADING,
    ...renderSection(true),
    "",
  ].join("\n");
};
