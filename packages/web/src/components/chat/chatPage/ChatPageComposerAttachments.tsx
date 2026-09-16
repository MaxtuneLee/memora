import { ImageIcon } from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";
import type { file as LiveStoreFile } from "@/livestore/file";

const styles = stylex.create({
  panel: {
    backgroundColor: "rgb(255 255 255 / 0.95)",
    border: "1px solid rgb(228 228 231 / 0.8)",
    borderRadius: 16,
    boxShadow: "0 1px 2px rgb(0 0 0 / 0.05)",
    marginBottom: 8,
    overflow: "hidden",
    position: "relative",
    zIndex: 10,
  },
  header: {
    alignItems: "center",
    borderBottom: "1px solid rgb(228 228 231 / 0.7)",
    display: "flex",
    gap: 12,
    justifyContent: "space-between",
    paddingBlock: 12,
    paddingInline: 14,
  },
  title: { color: "#18181b", fontSize: 14, fontWeight: 600 },
  description: { color: "#71717a", fontSize: 12 },
  actions: { alignItems: "center", display: "flex", gap: 8 },
  action: {
    backgroundColor: "white",
    border: "1px solid #e4e4e7",
    borderRadius: 9999,
    color: "#3f3f46",
    fontSize: 11,
    fontWeight: 600,
    paddingBlock: 6,
    paddingInline: 12,
    transition: "border-color 150ms, background-color 150ms",
    ":hover": { backgroundColor: "#fafafa", borderColor: "#d4d4d8" },
    ":disabled": { cursor: "not-allowed", opacity: 0.5 },
  },
  close: {
    backgroundColor: "#fafafa",
    color: "#71717a",
    fontWeight: 500,
    ":hover": { backgroundColor: "#f4f4f5", color: "#3f3f46" },
  },
  body: { padding: 12 },
  search: {
    alignItems: "center",
    backgroundColor: "#fafafa",
    border: "1px solid #e4e4e7",
    borderRadius: 12,
    display: "flex",
    gap: 8,
    paddingBlock: 10,
    paddingInline: 12,
  },
  icon: { color: "#a1a1aa", height: 16, width: 16 },
  input: {
    backgroundColor: "transparent",
    color: "#27272a",
    flex: 1,
    fontSize: 14,
    height: 28,
    minWidth: 0,
    outline: "none",
    "::placeholder": { color: "#a1a1aa" },
  },
  list: {
    display: "grid",
    gap: 8,
    marginTop: 12,
    "@media (min-width: 40rem)": { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
  },
  empty: {
    backgroundColor: "#fafafa",
    border: "1px dashed #e4e4e7",
    borderRadius: 12,
    color: "#71717a",
    fontSize: 12,
    paddingBlock: 24,
    paddingInline: 16,
    textAlign: "center",
    "@media (min-width: 40rem)": { gridColumn: "span 2 / span 2" },
  },
  item: {
    backgroundColor: "white",
    border: "1px solid #e4e4e7",
    borderRadius: 16,
    color: "#3f3f46",
    padding: 12,
    textAlign: "left",
    transition: "border-color 150ms, background-color 150ms",
    ":hover": { backgroundColor: "#fafafa", borderColor: "#d4d4d8" },
    ":disabled": { cursor: "not-allowed", opacity: 0.55 },
  },
  itemSelected: { backgroundColor: "#18181b", borderColor: "#18181b", color: "white" },
  itemHeader: {
    alignItems: "flex-start",
    display: "flex",
    gap: 12,
    justifyContent: "space-between",
  },
  itemCopy: { minWidth: 0 },
  itemName: {
    fontSize: 14,
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  itemSize: { color: "#71717a", fontSize: 11, marginTop: 4 },
  itemSizeSelected: { color: "#e4e4e7" },
  selectedBadge: {
    backgroundColor: "rgb(255 255 255 / 0.1)",
    border: "1px solid rgb(255 255 255 / 0.2)",
    borderRadius: 9999,
    color: "white",
    fontSize: 10,
    fontWeight: 600,
    paddingBlock: 4,
    paddingInline: 8,
  },
});

interface ChatPageComposerAttachmentsProps {
  remainingImageSlots: number;
  sessionsReady: boolean;
  imagePickerOpen: boolean;
  imagePickerQuery: string;
  imagePickerOptions: Array<{
    file: LiveStoreFile;
    isSelected: boolean;
  }>;
  onOpenLocalImagePicker: () => void;
  onCloseImagePicker: () => void;
  onImagePickerQueryChange: (value: string) => void;
  onSelectLibraryImage: (file: LiveStoreFile) => void;
}

export const ChatPageComposerAttachments = ({
  remainingImageSlots,
  sessionsReady,
  imagePickerOpen,
  imagePickerQuery,
  imagePickerOptions,
  onOpenLocalImagePicker,
  onCloseImagePicker,
  onImagePickerQueryChange,
  onSelectLibraryImage,
}: ChatPageComposerAttachmentsProps) => {
  return (
    <>
      {imagePickerOpen && (
        <div {...stylex.props(styles.panel)}>
          <div {...stylex.props(styles.header)}>
            <div>
              <p {...stylex.props(styles.title)}>Add images</p>
              <p {...stylex.props(styles.description)}>
                Paste, drop, upload, or pick from your library. {remainingImageSlots} slot
                {remainingImageSlots === 1 ? "" : "s"} left.
              </p>
            </div>
            <div {...stylex.props(styles.actions)}>
              <button
                type="button"
                onClick={onOpenLocalImagePicker}
                disabled={!sessionsReady || remainingImageSlots === 0}
                {...stylex.props(styles.action)}
              >
                Upload image
              </button>
              <button
                type="button"
                onClick={onCloseImagePicker}
                {...stylex.props(styles.action, styles.close)}
              >
                Close
              </button>
            </div>
          </div>
          <div {...stylex.props(styles.body)}>
            <div {...stylex.props(styles.search)}>
              <ImageIcon className={stylex.props(styles.icon).className} />
              <input
                value={imagePickerQuery}
                onChange={(event) => onImagePickerQueryChange(event.target.value)}
                placeholder="Search library images..."
                {...stylex.props(styles.input)}
              />
            </div>
            <div {...stylex.props(styles.list)}>
              {imagePickerOptions.length === 0 ? (
                <div {...stylex.props(styles.empty)}>No matching images in your library.</div>
              ) : (
                imagePickerOptions.map(({ file, isSelected }) => (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => onSelectLibraryImage(file)}
                    disabled={isSelected || remainingImageSlots === 0}
                    {...stylex.props(styles.item, isSelected && styles.itemSelected)}
                  >
                    <div {...stylex.props(styles.itemHeader)}>
                      <div {...stylex.props(styles.itemCopy)}>
                        <p {...stylex.props(styles.itemName)}>{file.name}</p>
                        <p
                          {...stylex.props(styles.itemSize, isSelected && styles.itemSizeSelected)}
                        >
                          {(file.sizeBytes / 1024 / 1024).toFixed(1)} MB
                        </p>
                      </div>
                      {isSelected && <span {...stylex.props(styles.selectedBadge)}>Added</span>}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
