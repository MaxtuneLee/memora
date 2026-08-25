import { dir as opfsDir, file as opfsFile, write as opfsWrite } from "@memora/fs";

import type { ContentArtifact } from "./types";

const CONTENT_FILE_SUFFIX = ".content.json";
const CONTENT_MARKDOWN_SUFFIX = ".content.md";

export const getArtifactDirectory = (fileId: string): string => `/files/${fileId}`;
export const getArtifactPath = (fileId: string): string =>
  `${getArtifactDirectory(fileId)}/${fileId}${CONTENT_FILE_SUFFIX}`;
export const getArtifactMarkdownPath = (fileId: string): string =>
  `${getArtifactDirectory(fileId)}/${fileId}${CONTENT_MARKDOWN_SUFFIX}`;

export const writeContentArtifact = async (artifact: ContentArtifact): Promise<void> => {
  await opfsDir(getArtifactDirectory(artifact.fileId)).create();
  await opfsWrite(getArtifactPath(artifact.fileId), JSON.stringify(artifact), { overwrite: true });
  await opfsWrite(getArtifactMarkdownPath(artifact.fileId), artifact.markdown, { overwrite: true });
};

export const readContentArtifact = async (fileId: string): Promise<ContentArtifact | null> => {
  try {
    return JSON.parse(await opfsFile(getArtifactPath(fileId)).text()) as ContentArtifact;
  } catch {
    return null;
  }
};

export const readExtractedContent = async (fileId: string): Promise<string | null> => {
  try {
    return await opfsFile(getArtifactMarkdownPath(fileId)).text();
  } catch {
    return null;
  }
};

export const removeContentArtifact = async (fileId: string): Promise<void> => {
  await Promise.all([
    opfsFile(getArtifactPath(fileId)).remove({ force: true }),
    opfsFile(getArtifactMarkdownPath(fileId)).remove({ force: true }),
  ]);
};
