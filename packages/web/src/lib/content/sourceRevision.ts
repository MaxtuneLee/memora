const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
};

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

export const hashContent = async (value: string | ArrayBuffer): Promise<string> => {
  const input = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", input);
  return toHex(new Uint8Array(digest));
};

export const createSourceRevision = async (input: {
  file: Pick<File, "name" | "type" | "size">;
  content: string | ArrayBuffer;
  parserVersion: string;
  configuration?: Record<string, unknown>;
}): Promise<string> => {
  const contentHash = await hashContent(input.content);
  return hashContent(
    stableStringify({
      contentHash,
      file: { name: input.file.name, size: input.file.size, type: input.file.type },
      parserVersion: input.parserVersion,
      configuration: input.configuration ?? {},
    }),
  );
};

export const createStableSegmentId = async (input: {
  fileId: string;
  sourceRevision: string;
  ordinal: number;
  kind: string;
  text: string;
  locator: unknown;
}): Promise<string> => {
  const digest = await hashContent(stableStringify(input));
  return `${input.fileId}:${digest.slice(0, 20)}`;
};
