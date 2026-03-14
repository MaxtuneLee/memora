import { createContext, useContext } from "react";

interface CloseSearchOptions {
  restoreFocus?: boolean;
}

export interface SearchPaletteContextValue {
  isSearchOpen: boolean;
  openSearch: (trigger?: HTMLElement | null) => void;
  closeSearch: (options?: CloseSearchOptions) => void;
  toggleSearch: (trigger?: HTMLElement | null) => void;
}

const SearchPaletteContext = createContext<SearchPaletteContextValue | null>(
  null,
);

export const useSearchPalette = (): SearchPaletteContextValue => {
  const context = useContext(SearchPaletteContext);
  if (!context) {
    throw new Error("useSearchPalette must be used within AppLayout.");
  }
  return context;
};

export const SearchPaletteContextProvider = SearchPaletteContext.Provider;
