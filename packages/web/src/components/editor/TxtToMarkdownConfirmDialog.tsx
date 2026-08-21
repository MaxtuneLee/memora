import { ConfirmDialog } from "@/components/desktop/ConfirmDialog";

interface TxtToMarkdownConfirmDialogProps {
  fileName: string;
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function TxtToMarkdownConfirmDialog({
  fileName,
  isOpen,
  onConfirm,
  onCancel,
}: TxtToMarkdownConfirmDialogProps) {
  return (
    <ConfirmDialog
      isOpen={isOpen}
      title={`Upgrade ${fileName} to Markdown?`}
      description="Plain text files need a Markdown upgrade before they can enter the future WYSIWYG editor. Source mode stays available either way."
      confirmLabel="Upgrade"
      cancelLabel="Stay in source mode"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
