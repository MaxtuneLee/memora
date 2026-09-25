export interface ComposerNotice {
  type: "error" | "success" | "info";
  text: string;
}

export type ReferencePickerSource = "button" | "mention" | null;
