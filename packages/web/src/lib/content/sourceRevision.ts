import { hashContent, hashStableValue } from "../contentHash";

export { hashContent } from "../contentHash";

export const createSourceRevision = async (input: {
  file: Pick<File, "name" | "type" | "size">;
  content: string | ArrayBuffer;
  parserVersion: string;
  configuration?: Record<string, unknown>;
}): Promise<string> => {
  const contentHash = await hashContent(input.content);
  return hashStableValue({
    contentHash,
    file: { name: input.file.name, size: input.file.size, type: input.file.type },
    parserVersion: input.parserVersion,
    configuration: input.configuration ?? {},
  });
};

export const createStableSegmentId = async (input: {
  fileId: string;
  sourceRevision: string;
  ordinal: number;
  kind: string;
  text: string;
  locator: unknown;
}): Promise<string> => {
  const digest = await hashStableValue(input);
  return `${input.fileId}:${digest.slice(0, 20)}`;
};
