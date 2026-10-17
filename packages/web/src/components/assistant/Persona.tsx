import { memo } from "react";

import MemoraMascot, { type MascotStyle, type MemoraMascotState } from "./MemoraMascot";

type PersonaState = MemoraMascotState;
type PersonaVariant = "obsidian" | "mana" | "opal" | "halo" | "glint" | "command";

type PersonaProps = {
  state: PersonaState;
  style?: MascotStyle;
  variant?: PersonaVariant;
  onLoad?: () => void;
  onLoadError?: (error: unknown) => void;
  onReady?: () => void;
  onPause?: () => void;
  onPlay?: () => void;
  onStop?: () => void;
};

export const Persona = memo(({ state = "idle", style }: PersonaProps) => {
  return <MemoraMascot state={state} style={style} />;
});
