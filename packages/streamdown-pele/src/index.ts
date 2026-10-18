import { renderAsync, type RenderOptions } from "pele/lazy";
import type { DiagramPlugin } from "streamdown";

export interface PelePluginOptions {
  /** Default Pele render options. */
  options?: RenderOptions;
}

type MermaidInstance = ReturnType<DiagramPlugin["getMermaid"]>;

/**
 * Streamdown diagram plugin that renders `mermaid` code blocks with Pele.
 * Colors and fonts come from `--pele-*` CSS variables on an ancestor element.
 */
export function createPelePlugin({ options = {} }: PelePluginOptions = {}): DiagramPlugin {
  const current: RenderOptions = options;

  const instance: MermaidInstance = {
    // Streamdown passes Mermaid.js config objects; Pele has its own options, so they are ignored.
    initialize() {},
    async render(id, source) {
      const { svg } = await renderAsync(source, { ...current, idPrefix: id });
      return { svg };
    },
  };

  return {
    name: "mermaid",
    type: "diagram",
    language: "mermaid",
    getMermaid: () => instance,
  };
}

export const pele: DiagramPlugin = createPelePlugin();
export { PeleError } from "pele/lazy";
export type { RenderOptions as PeleRenderOptions } from "pele/lazy";
