import * as stylex from "@stylexjs/stylex";

export const tokens = stylex.defineVars({
  background: "#fcfaf6",
  surface: "#fffdfa",
  surfaceMuted: "#f6f3ec",
  border: "#eae6df",
  text: "#1d1c1a",
  textMuted: "#716c64",
  olive: "#7b875a",
  oliveSoft: "#a7af8f",
  fontSans: '"Noto Sans", "Noto Sans SC", sans-serif',
  fontSerif: '"IBM Plex Serif", serif',
  radiusSmall: "0.5rem",
  radiusMedium: "0.75rem",
  durationFast: "220ms",
  easeOut: "cubic-bezier(0.25, 1, 0.5, 1)",
});

export const lightTheme = stylex.createTheme(tokens, {
  background: "#fcfaf6",
  surface: "#fffdfa",
  surfaceMuted: "#f6f3ec",
  border: "#eae6df",
  text: "#1d1c1a",
  textMuted: "#716c64",
  olive: "#7b875a",
  oliveSoft: "#a7af8f",
  fontSans: '"Noto Sans", "Noto Sans SC", sans-serif',
  fontSerif: '"IBM Plex Serif", serif',
  radiusSmall: "0.5rem",
  radiusMedium: "0.75rem",
  durationFast: "220ms",
  easeOut: "cubic-bezier(0.25, 1, 0.5, 1)",
});

export const appShellStyles = stylex.create({
  loading: {
    alignItems: "center",
    backgroundColor: tokens.background,
    color: tokens.textMuted,
    display: "flex",
    fontFamily: tokens.fontSans,
    fontSize: "0.875rem",
    height: "100dvh",
    justifyContent: "center",
    width: "100%",
  },
  shell: {
    backgroundColor: tokens.background,
    color: tokens.text,
    display: "flex",
    fontFamily: tokens.fontSans,
    height: "100dvh",
    minWidth: 0,
    overflow: "hidden",
    width: "100%",
    "::selection": {
      backgroundColor: "#879a4f",
      color: "#18181b",
    },
  },
  content: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    minWidth: 0,
    overflow: "hidden",
  },
  scrollArea: {
    flex: 1,
    overflowX: "hidden",
    overflowY: "auto",
  },
});
