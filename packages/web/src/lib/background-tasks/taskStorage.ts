import { dir as opfsDir, file as opfsFile, write as opfsWrite } from "@memora/fs";

import type { BackgroundTask, BackgroundTaskStorage } from "./types";

const TASKS_DIRECTORY = "/background-tasks";
const TASKS_PATH = `${TASKS_DIRECTORY}/tasks.json`;

export const createOpfsTaskStorage = (): BackgroundTaskStorage => ({
  load: async () => {
    try {
      return JSON.parse(await opfsFile(TASKS_PATH).text()) as BackgroundTask[];
    } catch {
      return [];
    }
  },
  save: async (tasks) => {
    await opfsDir(TASKS_DIRECTORY).create();
    await opfsWrite(TASKS_PATH, JSON.stringify(tasks), { overwrite: true });
  },
});

export const createMemoryTaskStorage = (initial: BackgroundTask[] = []): BackgroundTaskStorage => {
  let tasks = [...initial];
  return {
    load: async () => [...tasks],
    save: async (next) => {
      tasks = [...next];
    },
  };
};
