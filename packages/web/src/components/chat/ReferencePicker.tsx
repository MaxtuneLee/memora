import { FileTextIcon, FolderSimpleIcon, MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  root: {
    backgroundColor: "rgb(255 255 255 / 0.95)",
    border: "1px solid #e4e4e7",
    borderRadius: 12,
    boxShadow: "0 1px 2px rgb(0 0 0 / 0.05)",
    marginBottom: 8,
    overflow: "hidden",
    position: "relative",
    zIndex: 10,
  },
  header: {
    alignItems: "center",
    borderBottom: "1px solid #e4e4e7",
    display: "flex",
    gap: 8,
    paddingBlock: 8,
    paddingInline: 12,
  },
  icon: { color: "#a1a1aa", flexShrink: 0, height: 16, width: 16 },
  iconSelected: { color: "#e4e4e7" },
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
  close: {
    alignItems: "center",
    borderRadius: 8,
    color: "#a1a1aa",
    display: "inline-flex",
    height: 28,
    justifyContent: "center",
    transition: "all 150ms",
    width: 28,
    ":hover": { backgroundColor: "#f4f4f5", color: "#3f3f46" },
  },
  listArea: { maxHeight: 256, overflowY: "auto", padding: 6 },
  empty: {
    borderRadius: 8,
    color: "#71717a",
    fontSize: 12,
    paddingBlock: 24,
    paddingInline: 12,
    textAlign: "center",
  },
  list: { display: "flex", flexDirection: "column", gap: 4 },
  option: {
    alignItems: "center",
    borderRadius: 8,
    color: "#3f3f46",
    display: "flex",
    fontSize: 14,
    gap: 8,
    paddingBlock: 8,
    paddingInline: 10,
    textAlign: "left",
    transition: "all 150ms",
    width: "100%",
    ":hover": { backgroundColor: "#f4f4f5" },
  },
  optionSelected: { backgroundColor: "#18181b", color: "white" },
  name: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
});

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
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.header)}>
        <MagnifyingGlassIcon className={stylex.props(styles.icon).className} />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search files and folders..."
          {...stylex.props(styles.input)}
        />
        <button
          type="button"
          onClick={onClose}
          {...stylex.props(styles.close)}
          aria-label="Close reference picker"
        >
          <XIcon className={stylex.props(styles.icon).className} />
        </button>
      </div>
      <div {...stylex.props(styles.listArea)}>
        {options.length === 0 ? (
          <div {...stylex.props(styles.empty)}>No matching files or folders.</div>
        ) : (
          <div {...stylex.props(styles.list)}>
            {options.map((option) => (
              <button
                key={`${option.type}:${option.id}`}
                type="button"
                onClick={() => onSelect(option)}
                {...stylex.props(styles.option, option.isSelected && styles.optionSelected)}
              >
                {option.type === "folder" ? (
                  <FolderSimpleIcon
                    className={
                      stylex.props(styles.icon, option.isSelected && styles.iconSelected).className
                    }
                  />
                ) : (
                  <FileTextIcon
                    className={
                      stylex.props(styles.icon, option.isSelected && styles.iconSelected).className
                    }
                  />
                )}
                <span {...stylex.props(styles.name)}>{option.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
