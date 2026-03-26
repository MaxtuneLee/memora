import { Dialog } from "@base-ui/react/dialog";

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
  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-zinc-950/40 backdrop-blur-sm" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[min(420px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
          <div className="flex flex-col gap-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-zinc-900">{title}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-zinc-500">
                {description}
              </Dialog.Description>
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
                  tone === "danger"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-zinc-900 hover:bg-zinc-800"
                }`}
                onClick={onConfirm}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
