import { useId } from "react";

import { NativeDialog } from "@/components/ui/NativeDialog";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  tone?: "default" | "danger";
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  tone = "default",
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <NativeDialog
      open={isOpen}
      onOpenChange={(open) => !open && onCancel()}
      labelledBy={titleId}
      describedBy={descriptionId}
      panelClassName="w-[min(420px,92vw)] rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl"
    >
      <div className="flex flex-col gap-4">
        <div>
          <h2 id={titleId} className="text-lg font-semibold text-zinc-900">
            {title}
          </h2>
          <p id={descriptionId} className="mt-1 text-sm text-zinc-500">
            {description}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 transition hover:bg-zinc-50"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 text-sm text-white transition ${
              tone === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-zinc-900 hover:bg-zinc-800"
            }`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </NativeDialog>
  );
}
