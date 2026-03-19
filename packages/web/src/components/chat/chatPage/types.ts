import type { ElementType } from "react";

export interface SuggestionCard {
  icon: ElementType;
  title: string;
  description: string;
}

export interface ComposerNotice {
  type: "error" | "success" | "info";
  text: string;
}

export type ReferencePickerSource = "button" | "mention" | null;
