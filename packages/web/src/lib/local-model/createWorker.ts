export const createLocalModelWorker = (): Worker => {
  return new Worker(new URL("../../workers/localModel.worker.ts", import.meta.url), {
    type: "module",
  });
};
