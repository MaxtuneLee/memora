import { FileTextIcon, FolderSimpleIcon, MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

export interface ReferencePickerOption {
  type: "file" | "folder";
  id: string;
  name: string;
  isSelected: boolean;
}

interface ReferencePickerProps {
  open: boolean;
  query: string;
  options: ReferencePickerOption[];
  onQueryChange: (value: string) => void;
  onSelect: (option: ReferencePickerOption) => void;
  onClose: () => void;
}

export const ReferencePicker = ({
  open,
  query,
  options,
  onQueryChange,
  onSelect,
  onClose,
}: ReferencePickerProps) => {
  if (!open) {
    return null;
  }

  return (
    <div className="mb-2 overflow-hidden rounded-xl border border-zinc-200 bg-white/95 shadow-sm z-10 relative">
      <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2">
        <MagnifyingGlassIcon className="size-4 text-zinc-400" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search files and folders..."
          className="h-7 min-w-0 flex-1 bg-transparent text-sm text-zinc-800 outline-none placeholder:text-zinc-400"
        />
        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-7 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
          aria-label="Close reference picker"
        >
          <XIcon className="size-4" />
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto p-1.5">
        {options.length === 0 ? (
          <div className="rounded-lg px-3 py-6 text-center text-xs text-zinc-500">
            No matching files or folders.
          </div>
        ) : (
          <div className="space-y-1">
            {options.map((option) => (
              <button
                key={`${option.type}:${option.id}`}
                type="button"
                onClick={() => onSelect(option)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition",
                  option.isSelected ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100",
                )}
              >
                {option.type === "folder" ? (
                  <FolderSimpleIcon
                    className={cn(
                      "size-4 shrink-0",
                      option.isSelected ? "text-zinc-200" : "text-zinc-500",
                    )}
                  />
                ) : (
                  <FileTextIcon
                    className={cn(
                      "size-4 shrink-0",
                      option.isSelected ? "text-zinc-200" : "text-zinc-500",
                    )}
                  />
                )}
                <span className="truncate">{option.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
