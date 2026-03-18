import type { SkillStore } from "@memora/ai-core";
import { Allow, parse as parsePartialJson } from "partial-json";

export const SHOW_WIDGET_TOOL_NAME = "show_widget";
export const SHOW_WIDGET_SKILL_NAME = "show-widget-skills";
export const SHOW_WIDGET_README_PATH = "README.md";
const SHOW_WIDGET_TITLE_MAX_LENGTH = 80;

export const MODULE_GUIDELINE_PATHS = {
  art: "guidelines/art.md",
  mockup: "guidelines/mockup.md",
  interactive: "guidelines/interactive.md",
  chart: "guidelines/chart.md",
  diagram: "guidelines/diagram.md",
} as const;

export type ShowWidgetModule = keyof typeof MODULE_GUIDELINE_PATHS;

export const MODULE_SECTIONS: Record<ShowWidgetModule, string[]> = {
  art: ["sections/svg_setup.md", "sections/art_and_illustration.md"],
  mockup: ["sections/ui_components.md", "sections/color_palette.md"],
  interactive: ["sections/ui_components.md", "sections/color_palette.md"],
  chart: [
    "sections/ui_components.md",
    "sections/color_palette.md",
    "sections/charts_chart_js.md",
  ],
  diagram: [
    "sections/color_palette.md",
    "sections/svg_setup.md",
    "sections/diagram_types.md",
  ],
};

export const OPTIONAL_MODULE_SUPPLEMENTS: Record<ShowWidgetModule, string[]> = {
  art: ["guidelines/art_interactive.md"],
  mockup: [],
  interactive: [],
  chart: ["guidelines/chart_interactive.md"],
  diagram: [],
};

export interface ShowWidgetArguments {
  i_have_seen_read_me: boolean;
  title: string;
  loading_messages: string[];
  widget_code: string;
}

export type ChatWidgetPhase = "streaming" | "ready" | "error";

export interface ChatWidget {
  toolCallId: string;
  title: string;
  loadingMessages: string[];
  widgetCode: string;
  phase: ChatWidgetPhase;
  errorMessage?: string;
}

export interface ShowWidgetSkillTurnState {
  skillActivated: boolean;
  readmeRead: boolean;
  lastCategoryRead: ShowWidgetModule | null;
  sectionsRead: string[];
  optionalSupplementsRead: string[];
}

export interface ShowWidgetSkillTracker {
  resetTurn: () => void;
  getState: () => ShowWidgetSkillTurnState;
  wrapStore: (store: SkillStore) => SkillStore;
}

const createInitialState = (): ShowWidgetSkillTurnState => ({
  skillActivated: false,
  readmeRead: false,
  lastCategoryRead: null,
  sectionsRead: [],
  optionalSupplementsRead: [],
});

const normalizePath = (value: string): string => {
  return value.trim().replaceAll("\\", "/");
};

const toUniqueArray = (values: string[]): string[] => {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
};

const getModuleForGuidelinePath = (
  path: string,
): ShowWidgetModule | null => {
  const normalized = normalizePath(path);

  for (const [moduleName, guidelinePath] of Object.entries(MODULE_GUIDELINE_PATHS)) {
    if (guidelinePath === normalized) {
      return moduleName as ShowWidgetModule;
    }
  }

  return null;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
};

export const sanitizeShowWidgetArguments = (
  value: Partial<Record<keyof ShowWidgetArguments, unknown>>,
): Partial<ShowWidgetArguments> => {
  const result: Partial<ShowWidgetArguments> = {};

  if (typeof value.i_have_seen_read_me === "boolean") {
    result.i_have_seen_read_me = value.i_have_seen_read_me;
  }

  if (typeof value.title === "string") {
    result.title = value.title.trim();
  }

  if (value.loading_messages !== undefined) {
    result.loading_messages = toStringArray(value.loading_messages);
  }

  if (typeof value.widget_code === "string") {
    result.widget_code = value.widget_code;
  }

  return result;
};

export const parsePartialShowWidgetArguments = (
  raw: string,
): Partial<ShowWidgetArguments> | null => {
  if (!raw.trim()) {
    return null;
  }

  try {
    const parsed = parsePartialJson(raw, Allow.ALL) as
      | Partial<Record<keyof ShowWidgetArguments, unknown>>
      | null;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const sanitized = sanitizeShowWidgetArguments(parsed);
    return Object.keys(sanitized).length > 0 ? sanitized : null;
  } catch {
    return null;
  }
};

export const normalizeChatWidget = (value: unknown): ChatWidget | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Partial<ChatWidget>;
  const toolCallId =
    typeof candidate.toolCallId === "string" ? candidate.toolCallId.trim() : "";
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  const widgetCode =
    typeof candidate.widgetCode === "string" ? candidate.widgetCode : "";
  const loadingMessages = toStringArray(candidate.loadingMessages);
  const errorMessage =
    typeof candidate.errorMessage === "string" && candidate.errorMessage.trim()
      ? candidate.errorMessage.trim()
      : undefined;

  if (
    !toolCallId ||
    (candidate.phase !== "streaming" &&
      candidate.phase !== "ready" &&
      candidate.phase !== "error")
  ) {
    return null;
  }

  return {
    toolCallId,
    title,
    loadingMessages,
    widgetCode,
    phase: candidate.phase,
    ...(errorMessage ? { errorMessage } : {}),
  };
};

export const normalizeChatWidgets = (
  value: unknown,
): ChatWidget[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized: ChatWidget[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const widget = normalizeChatWidget(item);
    if (!widget || seen.has(widget.toolCallId)) {
      continue;
    }

    seen.add(widget.toolCallId);
    normalized.push(widget);
  }

  return normalized.length > 0 ? normalized : undefined;
};

export const validateShowWidgetCall = (
  params: ShowWidgetArguments,
): string | null => {
  const normalizedTitle = params.title.trim();
  if (!normalizedTitle) {
    return "title must not be empty.";
  }

  if (Array.from(normalizedTitle).length > SHOW_WIDGET_TITLE_MAX_LENGTH) {
    return `title must be ${SHOW_WIDGET_TITLE_MAX_LENGTH} characters or fewer.`;
  }

  if (!params.widget_code.trim()) {
    return "widget_code must not be empty.";
  }

  return null;
};

export const createShowWidgetSkillTracker = (): ShowWidgetSkillTracker => {
  let state = createInitialState();

  const markResourceRead = (path: string) => {
    const normalizedPath = normalizePath(path);

    if (normalizedPath === SHOW_WIDGET_README_PATH) {
      state = {
        ...state,
        readmeRead: true,
      };
      return;
    }

    const moduleName = getModuleForGuidelinePath(normalizedPath);
    if (moduleName) {
      state = {
        ...state,
        lastCategoryRead: moduleName,
        sectionsRead: [],
        optionalSupplementsRead: [],
      };
      return;
    }

    if (!state.lastCategoryRead) {
      return;
    }

    const requiredSections = MODULE_SECTIONS[state.lastCategoryRead] ?? [];
    if (requiredSections.includes(normalizedPath)) {
      state = {
        ...state,
        sectionsRead: toUniqueArray([...state.sectionsRead, normalizedPath]),
      };
      return;
    }

    const optionalSupplements =
      OPTIONAL_MODULE_SUPPLEMENTS[state.lastCategoryRead] ?? [];
    if (optionalSupplements.includes(normalizedPath)) {
      state = {
        ...state,
        optionalSupplementsRead: toUniqueArray([
          ...state.optionalSupplementsRead,
          normalizedPath,
        ]),
      };
    }
  };

  return {
    resetTurn: () => {
      state = createInitialState();
    },
    getState: () => ({
      ...state,
      sectionsRead: [...state.sectionsRead],
      optionalSupplementsRead: [...state.optionalSupplementsRead],
    }),
    wrapStore: (store: SkillStore): SkillStore => ({
      listSkills: () => store.listSkills(),
      activateSkill: async (skillName) => {
        const result = await store.activateSkill(skillName);
        if (result && skillName.trim() === SHOW_WIDGET_SKILL_NAME) {
          state = {
            ...state,
            skillActivated: true,
          };
        }
        return result;
      },
      readSkillResource: async (skillName, resourcePath) => {
        const result = await store.readSkillResource(skillName, resourcePath);
        if (
          result.ok &&
          skillName.trim() === SHOW_WIDGET_SKILL_NAME
        ) {
          markResourceRead(result.path);
        }
        return result;
      },
    }),
  };
};
