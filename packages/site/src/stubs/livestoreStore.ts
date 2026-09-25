// Stand-in for @memora/web's LiveStore module. The real one opens an OPFS database when it is
// imported; the marketing site only renders presentational components, which never reach it.
export function useAppStore(): never {
  throw new Error("The Memora site has no LiveStore. Render components that don't need it.");
}

export function useLiveStoreLoadingStatus(): { stage: "ready" } {
  return { stage: "ready" };
}
