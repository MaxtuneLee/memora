import { Dialog } from "@base-ui/react/dialog";
import type { WriteApprovalRequest } from "@/lib/chat/tools";

interface ToolWriteApprovalDialogProps {
  request: WriteApprovalRequest | null;
  onAllowOnce: () => void;
  onAllowSession: () => void;
  onDeny: () => void;
}

const describeOperation = (request: WriteApprovalRequest): string => {
  if (request.operation === "append") {
    return "Append text";
  }
  return request.overwrite ? "Write text (overwrite allowed)" : "Write text (create only)";
};

export function ToolWriteApprovalDialog({
  request,
  onAllowOnce,
  onAllowSession,
  onDeny,
}: ToolWriteApprovalDialogProps) {
  return (
    <Dialog.Root open={request !== null} onOpenChange={(open) => !open && onDeny()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-zinc-950/40 backdrop-blur-sm" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[min(460px,94vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
          <div className="flex flex-col gap-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-zinc-900">
                Approve file modification?
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-zinc-500">
                Memora wants to modify a text file. Review details before allowing.
              </Dialog.Description>
            </div>

            {request && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 text-xs text-zinc-700">
                <p>
                  <span className="font-medium text-zinc-900">Operation:</span>{" "}
                  {describeOperation(request)}
                </p>
                <p className="mt-1">
                  <span className="font-medium text-zinc-900">Path:</span> {request.path}
                </p>
                <p className="mt-1">
                  <span className="font-medium text-zinc-900">Content length:</span>{" "}
                  {request.contentLength.toLocaleString()} chars
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 transition hover:bg-zinc-50"
                onClick={onDeny}
              >
                Deny
              </button>
              <button
                type="button"
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 transition hover:bg-zinc-100"
                onClick={onAllowSession}
              >
                Always allow this session
              </button>
              <button
                type="button"
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white transition hover:bg-zinc-800"
                onClick={onAllowOnce}
              >
                Allow once
              </button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
