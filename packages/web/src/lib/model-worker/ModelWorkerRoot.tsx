import { useEffect, type ReactNode } from "react";

import { modelWorkerFactory } from "./factory";

export const ModelWorkerRoot = ({ children }: { children: ReactNode }) => {
  useEffect(() => modelWorkerFactory.mount(), []);
  return children;
};
