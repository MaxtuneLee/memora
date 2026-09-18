import { useAppStore } from "@/livestore/store";
import {
  CaretDownIcon,
  ChatCircleDotsIcon,
  FileTextIcon,
  MicrophoneIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import type { ComponentType, ReactElement, ReactNode } from "react";
import { useNavigate } from "react-router";

import { CalendarWidget } from "@/components/dashboard/CalendarWidget";
import { DashboardWelcomeHeading } from "@/components/dashboard/DashboardWelcomeHeading";
import {
  AddWidgetDialog,
  type PlaceWidgetInput,
} from "@/components/dashboard/homeGrid/AddWidgetDialog";
import { GeneratedWidgetTile } from "@/components/dashboard/homeGrid/GeneratedWidgetTile";
import { HomeGrid } from "@/components/dashboard/homeGrid/HomeGrid";
import { RecentWidget } from "@/components/dashboard/RecentWidget";
import { buildRecentItems } from "@/components/dashboard/recentItems";
import { AppMenu, AppMenuContent, AppMenuItem, AppMenuTrigger } from "@/components/menu/AppMenu";
import { desktopFilesQuery$, desktopFoldersQuery$ } from "@/lib/desktop/queries";
import { getDocumentEditorHref } from "@/lib/editor/editableTextDocument";
import { createNewMarkdownNote } from "@/lib/editor/noteCreation";
import { listChatSessions, type ChatSessionSummary } from "@/lib/chat/chatSessionStorage";
import { mapLiveStoreFileToMeta } from "@/lib/library/fileMappers";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import {
  createWidgetInstance,
  deleteWidgetInstance,
  reorderWidgetInstances,
} from "@/lib/widgets/widgetInstances";
import {
  activeWidgetDefinitionsQuery$,
  activeWidgetInstancesQuery$,
} from "@/lib/widgets/widgetQueries";
import { seedHomeGrid } from "@/lib/widgets/seedHomeGrid";
import { fileEvents } from "@/livestore/file";
import { normalizeSettingsValue, settingsTable, type setting } from "@/livestore/setting";
import type { widgetDefinition, widgetInstance } from "@/livestore/widget";
import type { SearchNavigationState } from "@/types/search";

import { TodoPanel } from "./TodoPanel";
import { DEFAULT_WELCOME_COPY, getWelcomeCopy } from "./welcomeCopy";

type IconWeight = "regular" | "fill" | "duotone" | "bold";

const DASHBOARD_FONT_FAMILY = '"Inter", ui-sans-serif, sans-serif';
const CALENDAR_MOTION_EASE = [0.22, 1, 0.36, 1] as const;

const styles = stylex.create({
  icon: { height: 16, width: 16 },
  menuAction: {
    alignItems: "center",
    borderRadius: 16,
    cursor: "pointer",
    display: "grid",
    gap: 12,
    gridTemplateColumns: "2rem minmax(0, 1fr)",
    outline: "none",
    paddingBlock: 10,
    paddingInline: 12,
    textAlign: "left",
    transition: "background-color 150ms",
    width: "100%",
    "[data-highlighted]": { backgroundColor: "#faf7f0" },
  },
  menuIconShell: {
    alignItems: "center",
    backgroundColor: "#f6f3ec",
    borderRadius: 9999,
    color: "#7c7265",
    display: "flex",
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  menuIcon: { height: 18, width: 18 },
  menuCopy: { minWidth: 0 },
  menuTitle: { color: "#1d1c1a", fontSize: 14, fontWeight: 600 },
  menuNote: { color: "#7a7369", fontSize: 11, lineHeight: "16px", marginTop: 2 },
  page: { backgroundColor: "#fcfaf6", color: "#1d1c1a", minHeight: "100%" },
  pageContent: {
    marginInline: "auto",
    maxWidth: 1080,
    paddingBlock: 32,
    paddingInline: 24,
    width: "100%",
    "@media (min-width: 48rem)": { paddingBlock: 40, paddingInline: 40 },
  },
  hero: { paddingBottom: 28, "@media (min-width: 48rem)": { paddingBottom: 32 } },
  welcomeHeader: { borderBottom: "1px solid #e9e5dc", paddingBottom: 16 },
  widgetsArea: { marginTop: 24 },
  menuRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "flex-end",
    marginBottom: 24,
  },
  triggerIconShell: {
    alignItems: "center",
    backgroundColor: "#f6f3ec",
    borderRadius: 9999,
    color: "#7c7265",
    display: "flex",
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  triggerCaret: { color: "#9a948a", height: 14, width: 14 },
  menuContentNarrow: { width: 224 },
});

function MenuActionItem({
  title,
  note,
  icon: Icon,
  iconWeight = "regular",
  onSelect,
}: {
  title: string;
  note: string;
  icon: ComponentType<{ className?: string; weight?: IconWeight }>;
  iconWeight?: IconWeight;
  onSelect: () => void;
}): ReactElement {
  return (
    <AppMenuItem onClick={onSelect} className={stylex.props(styles.menuAction).className}>
      <div {...stylex.props(styles.menuIconShell)}>
        <Icon className={stylex.props(styles.menuIcon).className} weight={iconWeight} />
      </div>
      <div {...stylex.props(styles.menuCopy)}>
        <div {...stylex.props(styles.menuTitle)}>{title}</div>
        <div {...stylex.props(styles.menuNote)}>{note}</div>
      </div>
    </AppMenuItem>
  );
}

const createUploadNavigationState = (): SearchNavigationState => {
  return {
    searchDesktopIntent: {
      requestId: crypto.randomUUID(),
      intent: {
        type: "uploadFile",
        parentId: null,
      },
    },
  };
};

export const Component = (): ReactElement => {
  const store = useAppStore();
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion() ?? false;
  const fileRows = store.useQuery(desktopFilesQuery$);
  const folderRows = store.useQuery(desktopFoldersQuery$);
  const widgetInstanceRows = store.useQuery(
    activeWidgetInstancesQuery$,
  ) as readonly widgetInstance[];
  const widgetDefinitionRows = store.useQuery(
    activeWidgetDefinitionsQuery$,
  ) as readonly widgetDefinition[];
  const documentEditorSettings = normalizeSettingsValue(
    (store.useQuery(settingsDocumentQuery$) as Partial<setting> | undefined) ??
      settingsTable.default.value,
  );
  const [chatSessions, setChatSessions] = useState<ChatSessionSummary[]>([]);
  const [chatSessionsLoaded, setChatSessionsLoaded] = useState(false);
  const [isAddWidgetOpen, setIsAddWidgetOpen] = useState(false);

  useEffect(() => {
    seedHomeGrid({ store });
  }, [store]);

  useEffect(() => {
    let cancelled = false;

    const loadSessions = async () => {
      try {
        const nextSessions = await listChatSessions();
        if (!cancelled) {
          setChatSessions(nextSessions);
          setChatSessionsLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setChatSessions([]);
          setChatSessionsLoaded(true);
        }
      }
    };

    void loadSessions();

    return () => {
      cancelled = true;
    };
  }, []);

  const files = useMemo(() => {
    return fileRows.map(mapLiveStoreFileToMeta);
  }, [fileRows]);

  const recentItems = useMemo(() => {
    return buildRecentItems(files, chatSessions);
  }, [chatSessions, files]);

  const recentActivityCount = useMemo(() => {
    return recentItems.filter((item) => item.updatedAt > 0).length;
  }, [recentItems]);

  const savedWidgetDefinitions = useMemo(() => {
    return widgetDefinitionRows.filter((definition) => definition.kind === "generated");
  }, [widgetDefinitionRows]);

  const welcomeCopy = useMemo(() => {
    if (!chatSessionsLoaded) {
      return DEFAULT_WELCOME_COPY;
    }

    return getWelcomeCopy({
      fileCount: files.length,
      chatCount: chatSessions.length,
      recentCount: recentActivityCount,
      now: new Date(),
    });
  }, [chatSessions.length, chatSessionsLoaded, files.length, recentActivityCount]);

  const homeGridTiles = useMemo(() => {
    const definitionsById = new Map(
      widgetDefinitionRows.map((definition) => [definition.id, definition]),
    );
    return widgetInstanceRows.map((instance) => ({
      instance,
      definition: definitionsById.get(instance.definitionId) ?? null,
    }));
  }, [widgetDefinitionRows, widgetInstanceRows]);

  const renderHomeGridWidget = useCallback(
    (definition: widgetDefinition, instance: widgetInstance): ReactNode => {
      if (definition.kind === "generated") {
        return <GeneratedWidgetTile store={store} definition={definition} instance={instance} />;
      }

      if (definition.kind !== "builtin") {
        return null;
      }

      if (definition.builtinKey === "calendar") {
        return <CalendarWidget activityTimestamps={recentItems.map((item) => item.updatedAt)} />;
      }

      if (definition.builtinKey === "todo") {
        return <TodoPanel files={files} store={store} />;
      }

      if (definition.builtinKey === "recent") {
        return <RecentWidget items={recentItems} />;
      }

      return null;
    },
    [files, recentItems, store],
  );

  const handleReorderWidgets = useCallback(
    (orderedIds: string[]) => {
      reorderWidgetInstances({ store, orderedIds });
    },
    [store],
  );

  const handleRemoveWidget = useCallback(
    (instanceId: string) => {
      deleteWidgetInstance({ store, id: instanceId });
    },
    [store],
  );

  const handlePlaceWidget = useCallback(
    (input: PlaceWidgetInput) => {
      createWidgetInstance({
        store,
        input: {
          id: crypto.randomUUID(),
          definitionId: input.definitionId,
          sortOrder: widgetInstanceRows.length,
          params: input.params,
        },
      });
    },
    [store, widgetInstanceRows.length],
  );

  const heroAnimations = reducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 18 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.42, ease: CALENDAR_MOTION_EASE },
      };

  const getSectionMotion = (delay: number) => {
    if (reducedMotion) {
      return {};
    }

    return {
      initial: { opacity: 0, y: 18 },
      animate: { opacity: 1, y: 0 },
      transition: { delay, duration: 0.42, ease: CALENDAR_MOTION_EASE },
    };
  };

  const handleUpload = () => {
    void navigate("/desktop", { state: createUploadNavigationState() });
  };

  const handleCreateNote = async () => {
    try {
      const result = await createNewMarkdownNote({
        settings: {
          defaultNoteLocationMode: documentEditorSettings.defaultNoteLocationMode,
          defaultNoteFolderId: documentEditorSettings.defaultNoteFolderId,
        },
        files,
        folders: folderRows.map((folder) => ({
          id: folder.id,
          name: folder.name,
          parentId: folder.parentId ?? null,
        })),
      });

      store.commit(fileEvents.fileCreated(result.createdEvent));
      void navigate(getDocumentEditorHref(result.meta.id));
    } catch (error) {
      console.error("Failed to create dashboard note:", error);
    }
  };

  return (
    <div {...stylex.props(styles.page)} style={{ fontFamily: DASHBOARD_FONT_FAMILY }}>
      <motion.div {...heroAnimations} {...stylex.props(styles.pageContent)}>
        <div {...stylex.props(styles.hero)}>
          <header {...stylex.props(styles.welcomeHeader)}>
            <DashboardWelcomeHeading
              title={welcomeCopy.title}
              description={welcomeCopy.description}
              isReady={chatSessionsLoaded}
              reducedMotion={reducedMotion}
            />
          </header>

          <div {...stylex.props(styles.widgetsArea)}>
            <div {...stylex.props(styles.menuRow)}>
              <AppMenu>
                <AppMenuTrigger>
                  <span {...stylex.props(styles.triggerIconShell)}>
                    <UploadSimpleIcon
                      className={stylex.props(styles.menuIcon).className}
                      weight="regular"
                    />
                  </span>
                  <span>New file</span>
                  <CaretDownIcon
                    data-dashboard-menu-caret=""
                    className={stylex.props(styles.triggerCaret).className}
                    weight="bold"
                  />
                </AppMenuTrigger>
                <AppMenuContent className={stylex.props(styles.menuContentNarrow).className}>
                  <MenuActionItem
                    title="New note"
                    note="Start a blank markdown note"
                    icon={FileTextIcon}
                    onSelect={() => {
                      void handleCreateNote();
                    }}
                  />
                  <MenuActionItem
                    title="Start recording"
                    note="Capture a thought quickly"
                    icon={MicrophoneIcon}
                    onSelect={() => navigate("/transcript/live")}
                  />
                  <MenuActionItem
                    title="Upload file"
                    note="Bring in notes or PDFs"
                    icon={UploadSimpleIcon}
                    onSelect={handleUpload}
                  />
                  <MenuActionItem
                    title="New chat"
                    note="Open a fresh thread"
                    icon={ChatCircleDotsIcon}
                    iconWeight="fill"
                    onSelect={() => navigate("/chat")}
                  />
                </AppMenuContent>
              </AppMenu>
            </div>

            <motion.div {...getSectionMotion(0.08)}>
              <HomeGrid
                tiles={homeGridTiles}
                renderWidget={renderHomeGridWidget}
                onReorder={handleReorderWidgets}
                onRemove={handleRemoveWidget}
                onAddWidget={() => setIsAddWidgetOpen(true)}
              />
            </motion.div>
          </div>
        </div>
      </motion.div>
      <AddWidgetDialog
        open={isAddWidgetOpen}
        definitions={savedWidgetDefinitions}
        onOpenChange={setIsAddWidgetOpen}
        onPlace={handlePlaceWidget}
      />
    </div>
  );
};
