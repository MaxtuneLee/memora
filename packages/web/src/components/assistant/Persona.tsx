import { memo } from "react";

import MemoraMascot, { type MemoraMascotState } from "./MemoraMascot";

export type PersonaState = MemoraMascotState;
export type PersonaVariant =
  | "obsidian"
  | "mana"
  | "opal"
  | "halo"
  | "glint"
  | "command";

type PersonaProps = {
  state: PersonaState;
  className?: string;
  variant?: PersonaVariant;
  onLoad?: () => void;
  onLoadError?: (error: unknown) => void;
  onReady?: () => void;
  onPause?: () => void;
  onPlay?: () => void;
  onStop?: () => void;
};

export const Persona = memo(
  ({ state = "idle", className }: PersonaProps) => {
    return <MemoraMascot state={state} className={className} />;
  },
);
