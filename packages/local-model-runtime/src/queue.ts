import type { LocalModelPriority, LocalModelTask } from "./types";

export interface QueuedLocalModelTask {
  requestId: string;
  priority: LocalModelPriority;
  task: LocalModelTask;
}

export interface LocalModelTaskQueue {
  enqueue: (task: QueuedLocalModelTask) => void;
  dequeue: () => QueuedLocalModelTask | undefined;
  remove: (requestId: string) => boolean;
  size: () => number;
}

export const createLocalModelTaskQueue = (): LocalModelTaskQueue => {
  const interactive: QueuedLocalModelTask[] = [];
  const background: QueuedLocalModelTask[] = [];

  const removeFrom = (queue: QueuedLocalModelTask[], requestId: string): boolean => {
    const index = queue.findIndex((task) => task.requestId === requestId);
    if (index < 0) return false;
    queue.splice(index, 1);
    return true;
  };

  return {
    enqueue(task) {
      if (task.priority === "interactive") {
        interactive.push(task);
      } else {
        background.push(task);
      }
    },
    dequeue() {
      return interactive.shift() ?? background.shift();
    },
    remove(requestId) {
      return removeFrom(interactive, requestId) || removeFrom(background, requestId);
    },
    size() {
      return interactive.length + background.length;
    },
  };
};
