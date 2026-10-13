import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { ControlsConfig, PluginConfig, ThemeInput } from "streamdown";

export const MEMORA_STREAMDOWN_CLASS_NAME = "streamdown-rich";

export const MEMORA_STREAMDOWN_CONTROLS: ControlsConfig = {
  code: {
    download: false,
  },
};

export const MEMORA_STREAMDOWN_THEME: [ThemeInput, ThemeInput] = [
  "github-light-default",
  "github-dark-default",
];

export const MEMORA_STREAMDOWN_PLUGINS: PluginConfig = {
  cjk,
  code: code,
  // ponytail: "$5 and $10" now renders as math; models are told to write currency as \$.
  math: createMathPlugin({ singleDollarTextMath: true }),
  mermaid,
};
