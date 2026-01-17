import {
  PlusIcon,
  FileTextIcon,
  DotsThreeVerticalIcon,
  ArrowRightIcon,
} from "@phosphor-icons/react";
import { Button } from "@base-ui/react/button";
import { useMemo } from "react";
import { formatBytes } from "../lib/format";
import { useSettingsDialog } from "@/hooks/useSettingDialog";
import { useStorageStats } from "../hooks/useStorageStats";

const RECENT_NOTES = [
  {
    id: "phoenix-specs",
    title: "Project Phoenix Specs",
    preview: "The new architecture relies on a distributed...",
    date: "2h ago",
    tag: "Engineering",
  },
  {
    id: "q3-marketing",
    title: "Q3 Marketing Strategy",
    preview: "Focus areas include organic growth and...",
    date: "5h ago",
    tag: "Marketing",
  },
  {
    id: "personal-goals-2026",
    title: "Personal Goals 2026",
    preview: "1. Learn Rust\n2. Run a marathon...",
    date: "1d ago",
    tag: "Personal",
  },
] as const;

export const Component = () => {
  const { openSettings } = useSettingsDialog();
  const { storageUsage, storageQuota, isStoragePersistent, categories } =
    useStorageStats();

  const storageSummary = useMemo(() => {
    if (!storageQuota) {
      return "Storage usage not available.";
    }
    return `${formatBytes(storageUsage)} of ${formatBytes(storageQuota)} used`;
  }, [storageQuota, storageUsage]);

  return (
    <div className="mx-auto max-w-5xl space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out">
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-zinc-200/70 pb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Welcome back
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 text-balance sm:text-4xl">
            Good afternoon, Max
          </h1>
          <p className="mt-3 max-w-xl text-base text-zinc-500 text-pretty">
            Here is what is waiting for you today.
          </p>
        </div>
        <Button className="flex items-center gap-2 rounded-full border border-zinc-900/60 bg-white/80 px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm transition-transform active:scale-95 hover:bg-white focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2">
          <PlusIcon className="size-4" weight="bold" />
          <span>New Note</span>
        </Button>
      </div>

      <section aria-labelledby="recent-notes-title" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2
            id="recent-notes-title"
            className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500"
          >
            Recent Notes
          </h2>
          <Button className="text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-700 flex items-center cursor-pointer">
            View all
            <ArrowRightIcon className="ml-2 size-3" />
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {RECENT_NOTES.map((note) => (
            <div
              key={note.id}
              className="group relative flex flex-col gap-3 rounded-2xl border border-zinc-200/80 bg-white/70 p-5 shadow-sm transition-all hover:border-zinc-300 hover:bg-white hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="flex size-8 items-center justify-center rounded-sm bg-zinc-50 text-zinc-400 group-hover:text-zinc-600">
                  <FileTextIcon className="size-4" />
                </div>
                <Button
                  aria-label="Note actions"
                  className="text-zinc-300 hover:text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <DotsThreeVerticalIcon className="size-5" />
                </Button>
              </div>

              <div>
                <h3 className="font-medium text-zinc-900 leading-tight">
                  {note.title}
                </h3>
                <p className="mt-1 text-sm text-zinc-500 line-clamp-2 text-pretty">
                  {note.preview}
                </p>
              </div>

              <div className="mt-auto flex items-center justify-between pt-2">
                <span className="inline-flex items-center rounded-full bg-zinc-100/80 px-2 py-0.5 text-xs font-medium text-zinc-600">
                  {note.tag}
                </span>
                <div className="text-xs text-zinc-400">{note.date}</div>
              </div>
            </div>
          ))}

          <Button className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-white/40 p-5 text-zinc-400 transition-colors hover:border-zinc-400 hover:bg-white/80 hover:text-zinc-600 focus-visible:ring-2 focus-visible:ring-zinc-400">
            <div className="flex size-10 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-zinc-900/5">
              <PlusIcon className="size-5" />
            </div>
            <span className="text-sm font-medium">Create new note</span>
          </Button>
        </div>
      </section>

      <section aria-labelledby="storage-title">
        <button
          type="button"
          onClick={() => openSettings("data-storage")}
          className="w-full text-left"
        >
          <div className="rounded-2xl border border-zinc-200/80 bg-white/70 p-6 shadow-sm transition hover:border-zinc-300 hover:bg-white">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2
                  id="storage-title"
                  className="text-lg font-semibold text-zinc-900"
                >
                  Storage
                </h2>
                <p className="mt-2 text-sm text-zinc-500">{storageSummary}</p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-3 py-1 text-xs font-medium text-zinc-600">
                <span
                  className={`size-2 rounded-full ${
                    isStoragePersistent ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                />
                {isStoragePersistent ? "Persistent" : "Not persistent"}
              </div>
            </div>
            <div className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-zinc-200">
              {categories.map((category) => (
                <div
                  key={category.id}
                  className={category.color}
                  style={{ width: `${category.fraction * 100}%` }}
                />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-zinc-500">
              {categories.map((category) => (
                <div key={category.id} className="flex items-center gap-1.5">
                  <span className={`size-2 rounded-full ${category.color}`} />
                  <span>{category.label}</span>
                  <span className="text-[11px] text-zinc-400">
                    {formatBytes(category.size)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </button>
      </section>
    </div>
  );
};
