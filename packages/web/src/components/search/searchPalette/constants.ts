import {
  ChatCircleIcon,
  FileIcon,
  FileTextIcon,
  FolderNotchOpenIcon,
  GearIcon,
  HouseIcon,
  LightningIcon,
} from "@phosphor-icons/react";

import type { GlobalSearchItem, SearchItemKind } from "@/types/search";

export interface SearchSection {
  id: string;
  label: string;
  items: GlobalSearchItem[];
  emptyMessage?: string;
}

export const CATEGORY_LABELS: Record<SearchItemKind, string> = {
  file: "File",
  content: "Content",
  folder: "Folder",
  chat: "Chat",
  settings: "Settings",
  page: "Page",
  action: "Action",
};

export const SEARCH_ITEM_ICONS: Record<SearchItemKind, React.ElementType> = {
  file: FileIcon,
  content: FileTextIcon,
  folder: FolderNotchOpenIcon,
  chat: ChatCircleIcon,
  settings: GearIcon,
  page: HouseIcon,
  action: LightningIcon,
};

export const sortByRecency = (items: GlobalSearchItem[]): GlobalSearchItem[] => {
  return items.slice().sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0));
};
