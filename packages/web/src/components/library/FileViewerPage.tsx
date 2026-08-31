import { ArrowLeftIcon } from "@phosphor-icons/react";
import { useAppStore } from "@/livestore/store";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { DocumentFilePreview } from "@/components/desktop/DocumentFilePreview";
import { formatBytes } from "@/lib/format";
import { getFileIcon } from "@/lib/library/fileIcon";
import { isFileViewerFile } from "@/lib/library/fileViewer";
import { resolveRecordingFile } from "@/lib/library/fileService";
import { activeFilesQuery$ } from "@/lib/library/queries";
import { mapLiveStoreFileToMeta } from "@/lib/library/fileMappers";
import type { file as LiveStoreFile } from "@/livestore/file";

export function FileViewerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const store = useAppStore();
  const files = store.useQuery(activeFilesQuery$) as LiveStoreFile[];
  const file = useMemo(() => files.find((candidate) => candidate.id === id) ?? null, [files, id]);
  const fileMeta = useMemo(() => (file ? mapLiveStoreFileToMeta(file) : null), [file]);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fileMeta || !isFileViewerFile(fileMeta)) {
      setPreviewFile(null);
      return;
    }

    let cancelled = false;
    setError(null);
    setPreviewFile(null);
    void resolveRecordingFile(fileMeta)
      .then((resolvedFile) => {
        if (cancelled) return;
        if (!resolvedFile) {
          setError("This file is no longer available in local storage.");
          return;
        }
        setPreviewFile(
          resolvedFile.name === fileMeta.name && resolvedFile.type
            ? resolvedFile
            : new File([resolvedFile], fileMeta.name, {
                type: resolvedFile.type || fileMeta.mimeType,
              }),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setError("The file could not be opened.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fileMeta]);

  useEffect(() => {
    if (!previewFile || fileMeta?.type !== "image") {
      setImageUrl(null);
      return;
    }

    const url = URL.createObjectURL(previewFile);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [fileMeta?.type, previewFile]);

  if (!fileMeta || !isFileViewerFile(fileMeta)) {
    return (
      <main className="flex min-h-full items-center justify-center px-6 py-16">
        <div className="max-w-md text-center">
          <h1 className="font-serif text-3xl font-semibold text-[var(--color-memora-text-strong)]">
            File unavailable
          </h1>
          <button
            type="button"
            onClick={() => void navigate("/files")}
            className="mt-5 text-sm font-medium text-[var(--color-memora-olive)] underline-offset-4 hover:underline"
          >
            Return to files
          </button>
        </div>
      </main>
    );
  }

  const isImage = fileMeta.type === "image";
  const FileIcon = getFileIcon(fileMeta);

  return (
    <main className="min-h-full bg-[var(--color-memora-canvas)] px-4 py-5 sm:px-8 sm:py-8 lg:px-12">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col">
        <header className="flex items-start justify-between gap-5 border-b border-[var(--color-memora-border)] pb-5">
          <div className="flex min-w-0 items-start gap-3">
            <button
              type="button"
              onClick={() => void navigate(-1)}
              className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--color-memora-text-soft)] transition hover:bg-[var(--color-memora-hover)] hover:text-[var(--color-memora-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-memora-olive-soft)]"
              aria-label="Go back"
            >
              <ArrowLeftIcon className="size-4" weight="bold" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate font-serif text-2xl font-semibold text-[var(--color-memora-text-strong)] sm:text-3xl">
                {fileMeta.name}
              </h1>
              <p className="mt-1 text-sm text-[var(--color-memora-text-muted)]">
                {formatBytes(fileMeta.sizeBytes)}
              </p>
            </div>
          </div>
          <FileIcon className="mt-1 size-5 shrink-0 text-[var(--color-memora-text-soft)]" />
        </header>

        <section className="min-h-0 flex-1 py-6">
          {error ? (
            <div className="flex h-full min-h-72 items-center justify-center text-sm text-[var(--color-memora-warning-text)]">
              {error}
            </div>
          ) : !previewFile ? (
            <div className="flex h-full min-h-72 items-center justify-center text-sm text-[var(--color-memora-text-muted)]">
              Opening file…
            </div>
          ) : isImage ? (
            <div className="flex h-full min-h-72 items-center justify-center overflow-hidden rounded-[1.5rem] border border-[var(--color-memora-border)] bg-[var(--color-memora-surface-soft)] p-4 sm:p-8">
              <img
                src={imageUrl ?? undefined}
                alt={fileMeta.name}
                className="max-h-[calc(100vh-15rem)] max-w-full rounded-lg object-contain shadow-[0_20px_48px_-28px_rgba(34,33,29,0.35)]"
              />
            </div>
          ) : (
            <div className="h-[calc(100vh-13rem)] min-h-96 overflow-hidden rounded-[1.5rem] border border-[var(--color-memora-border)] bg-[var(--color-memora-surface-soft)] p-3 sm:p-5">
              <DocumentFilePreview file={previewFile} />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
