export const createLocalModelWorker = (): Worker => {
  return new Worker(new URL("../../workers/localModel.worker.ts", import.meta.url), {
    type: "module",
  });
};

export const createTexoFormulaWorker = (): Worker => {
  return new Worker(new URL("../../workers/local-model/texoFormula.worker.ts", import.meta.url), {
    type: "module",
  });
};
