import { hashContent, hashStableValue } from "../contentHash";
import type { VectorDbIndexConfig } from "./client";

export const getVectorDbIndexId = async (config: VectorDbIndexConfig): Promise<string> => {
  return (await hashStableValue(config)).slice(0, 24);
};

export const getVectorDbContentHash = (value: string): Promise<string> => {
  return hashContent(value);
};
