import { file as opfsFile } from "@memora/fs";

import { fileEvents, fileTable, type file as LiveStoreFile } from "@/livestore/file";
import { getVectorDbIndexId, type VectorDbClient } from "@/lib/vector-db";
import type { EmbeddingRuntime } from "@/lib/models/embeddingRuntime";
import { LEXICAL_INDEX_CONFIG } from "@/lib/search/searchIndexConfig";
import type { BackgroundTaskHandler } from "@/lib/background-tasks";

import {
  contentParserRegistry,
  createSourceRevision,
  indexContentArtifactLexically,
  indexContentArtifactSemantically,
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

export const restoreStoredFileMetadata = (
  origin: File,
  metadata: Pick<LiveStoreFile, "name" | "mimeType">,
): File =>
  new File([origin], metadata.name, {
    type: metadata.mimeType || origin.type,
    lastModified: origin.lastModified,
  });

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
  if (origin) return restoreStoredFileMetadata(origin, row);
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
  getEmbeddingRuntime?: () => EmbeddingRuntime | null;
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
    run: async ({ fileId, sourceRevision }, context) => {
      const row = getFile(input.store, fileId);
      if (!row || row.deletedAt || row.purgedAt) return;
      const artifact = await readContentArtifact(fileId);
      if (!artifact || artifact.sourceRevision !== sourceRevision) return;
      try {
        context.signal.throwIfAborted();
        await indexContentArtifactLexically(input.vectorDb.forIndex(LEXICAL_INDEX_CONFIG), artifact);
        setIndexStatus(
          input.store,
          fileId,
          "indexed",
          [artifact.title, artifact.plainText].filter(Boolean).join(" — ").slice(0, 280),
        );
        const runtime = input.getEmbeddingRuntime?.();
        if (runtime) {
          const indexId = await getVectorDbIndexId(runtime.indexConfig);
          await context.enqueue({ kind: "content.index.semantic", payload: { fileId, sourceRevision, indexId },
            dedupeKey: `semantic:${fileId}:${sourceRevision}:${indexId}`, resourceGroup: "embedding", dependsOn: [context.task.id] });
        }
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

  const semantic: BackgroundTaskHandler<{ fileId: string; sourceRevision?: string; indexId: string }> = {
    kind: "content.index.semantic",
    run: async ({ fileId, sourceRevision, indexId }, context) => {
      context.signal.throwIfAborted();
      const row = getFile(input.store, fileId);
      if (!row || row.deletedAt || row.purgedAt) return;
      const runtime = input.getEmbeddingRuntime?.();
      if (!runtime || await getVectorDbIndexId(runtime.indexConfig) !== indexId) return;
      const artifact = await readContentArtifact(fileId);
      if (!artifact || (sourceRevision && artifact.sourceRevision !== sourceRevision)) return;
      await indexContentArtifactSemantically(input.vectorDb.forIndex(runtime.indexConfig), artifact, runtime, {
        signal: context.signal, onProgress: context.reportProgress,
      });
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

  return [extract, lexical, semantic, remove, reconcile] as unknown as BackgroundTaskHandler[];
};
