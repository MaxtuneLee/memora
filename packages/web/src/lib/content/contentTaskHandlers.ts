import { file as opfsFile } from "@memora/fs";

import { fileEvents, fileTable, type file as LiveStoreFile } from "@/livestore/file";
import type { VectorDbClient } from "@/lib/vector-db";
import { LEXICAL_INDEX_CONFIG } from "@/lib/search/searchIndexConfig";
import type { BackgroundTaskHandler } from "@/lib/background-tasks";

import {
  contentParserRegistry,
  createSourceRevision,
  indexContentArtifactLexically,
  readContentArtifact,
  removeContentArtifact,
  writeContentArtifact,
} from ".";

interface ContentTaskStore {
  query: (query: unknown) => readonly LiveStoreFile[];
  commit: (event: unknown) => void;
}

const getFile = (store: ContentTaskStore, fileId: string): LiveStoreFile | null =>
  (store.query(fileTable.where({ id: fileId })) as readonly LiveStoreFile[])[0] ?? null;

const resolveFile = async (row: LiveStoreFile): Promise<File> => {
  if ((row.type === "audio" || row.type === "video") && row.transcriptPath) {
    const transcript = await opfsFile(row.transcriptPath).getOriginFile();
    if (transcript) {
      return transcript.name.endsWith(".transcript.json")
        ? transcript
        : new File([transcript], `${row.name}.transcript.json`, { type: "application/json" });
    }
    return new File(
      [await opfsFile(row.transcriptPath).arrayBuffer()],
      `${row.name}.transcript.json`,
      { type: "application/json" },
    );
  }
  const origin = await opfsFile(row.storagePath).getOriginFile();
  if (origin) return origin;
  return new File([await opfsFile(row.storagePath).arrayBuffer()], row.name, {
    type: row.mimeType,
  });
};

const setIndexStatus = (
  store: ContentTaskStore,
  fileId: string,
  status: "pending" | "processing" | "indexed" | "failed",
  summary?: string,
): void => {
  store.commit(
    fileEvents.fileIndexed({
      id: fileId,
      indexStatus: status,
      indexedAt: status === "indexed" ? new Date() : undefined,
      indexSummary: summary,
      updatedAt: new Date(),
    }),
  );
};

export const createContentTaskHandlers = (input: {
  store: ContentTaskStore;
  vectorDb: VectorDbClient;
}): BackgroundTaskHandler[] => {
  const extract: BackgroundTaskHandler<{ fileId: string }> = {
    kind: "content.extract",
    run: async ({ fileId }, context) => {
      const row = getFile(input.store, fileId);
      if (!row || row.deletedAt || row.purgedAt) return;
      setIndexStatus(input.store, fileId, "processing");
      try {
        if ((row.type === "audio" || row.type === "video") && !row.transcriptPath) {
          setIndexStatus(input.store, fileId, "pending", "Waiting for transcription.");
          return;
        }
        const file = await resolveFile(row);
        const parser = contentParserRegistry.resolve(file);
        if (!parser) {
          setIndexStatus(
            input.store,
            fileId,
            "indexed",
            "No extractable content for this file type.",
          );
          return;
        }
        const content = await file.arrayBuffer();
        const sourceRevision = await createSourceRevision({
          file,
          content,
          parserVersion: parser.version,
        });
        const artifact = await contentParserRegistry.parse({
          fileId,
          sourceRevision,
          file,
          signal: context.signal,
          onProgress: context.reportProgress,
        });
        await writeContentArtifact(artifact);
        await context.enqueue({
          kind: "content.index.lexical",
          payload: { fileId, sourceRevision },
          dedupeKey: `lexical:${fileId}:${sourceRevision}`,
          resourceGroup: "io",
          dependsOn: [context.task.id],
        });
      } catch (error) {
        setIndexStatus(
          input.store,
          fileId,
          "failed",
          error instanceof Error ? error.message.slice(0, 280) : "Content extraction failed.",
        );
        throw error;
      }
    },
  };

  const lexical: BackgroundTaskHandler<{ fileId: string; sourceRevision: string }> = {
    kind: "content.index.lexical",
    run: async ({ fileId, sourceRevision }) => {
      const row = getFile(input.store, fileId);
      if (!row || row.deletedAt || row.purgedAt) return;
      const artifact = await readContentArtifact(fileId);
      if (!artifact || artifact.sourceRevision !== sourceRevision) return;
      try {
        await input.vectorDb.initialize(LEXICAL_INDEX_CONFIG);
        await indexContentArtifactLexically(input.vectorDb, artifact);
        setIndexStatus(
          input.store,
          fileId,
          "indexed",
          [artifact.title, artifact.plainText].filter(Boolean).join(" — ").slice(0, 280),
        );
      } catch (error) {
        setIndexStatus(
          input.store,
          fileId,
          "failed",
          error instanceof Error ? error.message.slice(0, 280) : "Lexical indexing failed.",
        );
        throw error;
      }
    },
  };

  const remove: BackgroundTaskHandler<{ fileId: string }> = {
    kind: "content.delete",
    run: async ({ fileId }) => {
      await removeContentArtifact(fileId);
    },
  };

  const reconcile: BackgroundTaskHandler<{ fileIds: string[] }> = {
    kind: "content.reconcile",
    run: async ({ fileIds }, context) => {
      for (const fileId of fileIds) {
        const row = getFile(input.store, fileId);
        if (!row || row.deletedAt || row.purgedAt) {
          await context.enqueue({
            kind: "content.delete",
            payload: { fileId },
            dedupeKey: `delete:${fileId}`,
          });
        } else if (row.indexStatus !== "indexed") {
          await context.enqueue({
            kind: "content.extract",
            payload: { fileId },
            dedupeKey: `extract:${fileId}:${row.updatedAt instanceof Date ? row.updatedAt.getTime() : 0}`,
            resourceGroup: "document-parser",
          });
        }
      }
    },
  };

  return [extract, lexical, remove, reconcile] as unknown as BackgroundTaskHandler[];
};
