import { useAppStore } from "@/livestore/store";
import { Toast } from "@base-ui/react/toast";
import {
  CaretDownIcon,
  ChatCircleDotsIcon,
  CheckIcon,
  FileTextIcon,
  MicrophoneIcon,
  PaintBrushBroadIcon,
  PlusIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import type { ComponentType, ReactElement, ReactNode } from "react";
import { useNavigate } from "react-router";

import { DashboardWelcomeHeading } from "@/components/dashboard/DashboardWelcomeHeading";
import { DashboardToolbarButton } from "@/components/dashboard/DashboardToolbarButton";
import {
  AddWidgetDrawer,
  type PlaceWidgetInput,
} from "@/components/dashboard/homeGrid/AddWidgetDrawer";
import { renderBuiltinWidget } from "@/components/dashboard/homeGrid/builtinWidgetPreview";
import { GeneratedWidgetTile } from "@/components/dashboard/homeGrid/GeneratedWidgetTile";
import { HomeGrid } from "@/components/dashboard/homeGrid/HomeGrid";
import { getHomeGridTileViewTransitionName } from "@/components/dashboard/homeGrid/HomeGridTile";
import {
  runHomeGridViewTransition,
  type SharedViewTransitionElement,
} from "@/components/dashboard/homeGrid/homeGridViewTransition";
import { ConfirmDialog } from "@/components/desktop/ConfirmDialog";
import { buildRecentItems } from "@/components/dashboard/recentItems";
import { AppMenu, AppMenuContent, AppMenuItem, AppMenuTrigger } from "@/components/menu/AppMenu";
import ToastStack from "@/components/ToastStack";
import { desktopFilesQuery$, desktopFoldersQuery$ } from "@/lib/desktop/queries";
import { getDocumentEditorHref } from "@/lib/editor/editableTextDocument";
import { createNewMarkdownNote } from "@/lib/editor/noteCreation";
import { listChatSessions, type ChatSessionSummary } from "@/lib/chat/chatSessionStorage";
import { mapLiveStoreFileToMeta } from "@/lib/library/fileMappers";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { deleteWidgetDefinition, updateWidgetDefinition } from "@/lib/widgets/widgetDefinitions";
import {
  createWidgetInstance,
  deleteWidgetInstance,
  nextWidgetInstanceSortOrder,
  reorderWidgetInstances,
  resizeWidgetInstance,
  restoreWidgetInstance,
} from "@/lib/widgets/widgetInstances";
import {
  activeWidgetDefinitionsQuery$,
  activeWidgetInstancesQuery$,
} from "@/lib/widgets/widgetQueries";
import { seedHomeGrid } from "@/lib/widgets/seedHomeGrid";
import { setPendingHomeGridPrompt } from "@/lib/widgets/homeGridPrompt";
import { fileEvents } from "@/livestore/file";
import { normalizeSettingsValue, settingsTable, type setting } from "@/livestore/setting";
import type { widgetDefinition, widgetInstance } from "@/livestore/widget";
import type { SearchNavigationState } from "@/types/search";

import { DEFAULT_WELCOME_COPY, getWelcomeCopy } from "./welcomeCopy";

type IconWeight = "regular" | "fill" | "duotone" | "bold";

const DASHBOARD_FONT_FAMILY = '"Inter", ui-sans-serif, sans-serif';
const CALENDAR_MOTION_EASE = [0.22, 1, 0.36, 1] as const;
const ACTION_SPLIT_EASE = [0.23, 1, 0.32, 1] as const;
const ACTION_LAYOUT_EASE = [0.77, 0, 0.175, 1] as const;
const ACTION_MORPH_DURATION = 0.8;
const ACTION_MORPH_GAP = 10;
// Collapsed width of the Add widget pill, matched to the button's 2.75rem min-height. Square is
// what lets the maxed border-radius resolve to a full circle: the browser clamps radius to half
// the shorter side, so a narrower nub would render as a lozenge with straight vertical edges.
// Must stay under the toggle's own width so the parked nub sits entirely within its silhouette;
// the matching negative margin is what puts it there.
const ACTION_MORPH_TUCK = 44;
// Fraction of the morph the label takes. On the way in it runs first, so on the way out it runs
// last: the retract is the same timeline played backwards.
const ACTION_MORPH_LABEL_RATIO = 0.3;
const ACTION_REDUCED_MOTION_DURATION = 0.16;

// Retract is the extrude played backwards: same targets, same curve, no exit-only timing. Anything
// that runs on one direction but not the other shows up as a stutter at the seam.
const ACTION_PILL_TUCKED = { marginRight: -ACTION_MORPH_TUCK, width: ACTION_MORPH_TUCK };
const ACTION_PILL_OPEN = { marginRight: ACTION_MORPH_GAP, width: "auto" };
const ACTION_LABEL_HIDDEN = { filter: "blur(8px)", opacity: 0 };
const ACTION_LABEL_SHOWN = { filter: "blur(0px)", opacity: 1 };

const MotionToolbarButton = motion.create(DashboardToolbarButton);

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
    // Wide enough for the Home Grid's four ~280px square columns plus gaps at 40px page padding.
    maxWidth: 1480,
    paddingBlock: 32,
    paddingInline: 24,
    width: "100%",
    "@media (min-width: 48rem)": { paddingBlock: 40, paddingInline: 40 },
  },
  hero: { paddingBottom: 28, "@media (min-width: 48rem)": { paddingBottom: 32 } },
  welcomeHeader: { borderBottom: "1px solid #e9e5dc", paddingBottom: 16 },
  widgetsArea: { marginTop: 24 },
  menuRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "flex-end",
    marginBottom: 24,
  },
  actionMorph: {
    alignItems: "center",
    display: "flex",
    justifyContent: "flex-end",
    overflow: "visible",
    position: "relative",
  },
  actionFilterDefinition: { height: 0, position: "absolute", width: 0 },
  // The gap between the pill and the toggle lives on the pill's own margin, not on actionMorph, so
  // it can go negative and carry the pill underneath the toggle.
  actionMotionPill: { flexShrink: 0, overflow: "hidden", whiteSpace: "nowrap" },
  // Lifts the toggle into its own stacking level so the retracting pill passes beneath it.
  actionToggle: { position: "relative", zIndex: 1 },
  actionButtonContent: { alignItems: "center", display: "flex", gap: "0.5rem" },
  menuMotionItem: { display: "flex" },
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
  primaryTriggerIconShell: {
    backgroundColor: "rgba(255, 253, 248, 0.14)",
    color: "#fffdf8",
  },
  triggerCaret: { color: "#9a948a", height: 14, width: 14 },
  menuContentNarrow: { width: 224 },
  toast: {
    alignItems: "center",
    backgroundColor: "#fffdf8",
    border: "1px solid #e9e5dc",
    borderRadius: 16,
    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.08)",
    display: "flex",
    gap: 12,
    paddingBlock: 12,
    paddingInline: 16,
  },
  toastTitle: { color: "#1d1c1a", flex: 1, fontSize: 13, fontWeight: 600 },
  toastAction: {
    backgroundColor: "transparent",
    border: "none",
    color: "#4f5742",
    cursor: "pointer",
    flexShrink: 0,
    fontSize: 13,
    fontWeight: 600,
    ":hover": { textDecoration: "underline" },
  },
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
  const { add: addToast, close: closeToast } = Toast.useToastManager();
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
  const [isHomeGridEditing, setIsHomeGridEditing] = useState(false);
  const [isHomeGridActionMorphing, setIsHomeGridActionMorphing] = useState(false);
  const [pendingWidgetLinkUrl, setPendingWidgetLinkUrl] = useState<string | null>(null);
  const [pendingDeleteDefinitionId, setPendingDeleteDefinitionId] = useState<string | null>(null);
  // Placing/removing a widget instance round-trips through the LiveStore worker before
  // `widgetInstanceRows` reflects it, so its timing does not align with the browser's snapshot
  // window. These optimistic overrides update the grid inside the transition callback; each is
  // reconciled away once the store's own query confirms the change.
  const [optimisticInstances, setOptimisticInstances] = useState<
    { instance: widgetInstance; definition: widgetDefinition }[]
  >([]);
  const [optimisticallyRemovedIds, setOptimisticallyRemovedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const editToggleRef = useRef<HTMLButtonElement | null>(null);
  const previousHomeGridEditingRef = useRef(isHomeGridEditing);

  useEffect(() => {
    setOptimisticInstances((current) => {
      const stillPending = current.filter(
        (optimistic) => !widgetInstanceRows.some((row) => row.id === optimistic.instance.id),
      );
      return stillPending.length === current.length ? current : stillPending;
    });
    setOptimisticallyRemovedIds((current) => {
      const stillRelevant = new Set(
        [...current].filter((id) => widgetInstanceRows.some((row) => row.id === id)),
      );
      return stillRelevant.size === current.size ? current : stillRelevant;
    });
  }, [widgetInstanceRows]);

  const runOptimisticViewTransition = useCallback(
    (update: () => void, sharedElement?: SharedViewTransitionElement, afterUpdate?: () => void) => {
      runHomeGridViewTransition({ update, afterUpdate, reducedMotion, sharedElement });
    },
    [reducedMotion],
  );

  const handleWidgetSendPrompt = useCallback(
    (text: string) => {
      setPendingHomeGridPrompt(text);
      void navigate("/chat");
    },
    [navigate],
  );

  const handleWidgetOpenLink = useCallback((url: string) => {
    setPendingWidgetLinkUrl(url);
  }, []);

  const handleConfirmWidgetLink = useCallback(() => {
    if (pendingWidgetLinkUrl) {
      window.open(pendingWidgetLinkUrl, "_blank", "noopener,noreferrer");
    }
    setPendingWidgetLinkUrl(null);
  }, [pendingWidgetLinkUrl]);

  useEffect(() => {
    void seedHomeGrid({ store }).catch((error) => {
      console.error("Failed to seed the Home Grid:", error);
    });
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

  const placedDefinitionIds = useMemo(() => {
    return new Set(widgetInstanceRows.map((instance) => instance.definitionId));
  }, [widgetInstanceRows]);

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
    const persisted = widgetInstanceRows
      .filter((instance) => !optimisticallyRemovedIds.has(instance.id))
      .map((instance) => ({
        instance,
        definition: definitionsById.get(instance.definitionId) ?? null,
      }));
    const pending = optimisticInstances.filter(
      (optimistic) => !widgetInstanceRows.some((row) => row.id === optimistic.instance.id),
    );
    return [...persisted, ...pending].sort((a, b) => a.instance.sortOrder - b.instance.sortOrder);
  }, [widgetDefinitionRows, widgetInstanceRows, optimisticInstances, optimisticallyRemovedIds]);

  const hasHomeGridTiles = homeGridTiles.some((tile) => tile.definition !== null);

  const isToggleShowingDone = isHomeGridEditing;

  useEffect(() => {
    if (!hasHomeGridTiles) {
      setIsHomeGridEditing(false);
    }
  }, [hasHomeGridTiles]);

  useEffect(() => {
    if (previousHomeGridEditingRef.current === isHomeGridEditing) {
      return;
    }

    previousHomeGridEditingRef.current = isHomeGridEditing;
    // The toggle drives the metaball filter, not Motion's animation callbacks: those only report
    // on targets defined in `animate`, so the retract ran without any goo. Keying off the toggle
    // covers both directions. reducedMotion is handled where the filter is applied, so it stays
    // out of the deps and this can never early-return with the filter stuck on.
    setIsHomeGridActionMorphing(true);
    const morphTimer = window.setTimeout(() => {
      setIsHomeGridActionMorphing(false);
    }, ACTION_MORPH_DURATION * 1000);
    // Long-pressing a tile can enter edit mode without the toggle being focused; move focus
    // there so the way out is reachable. A no-op when the toggle was clicked.
    const frame = requestAnimationFrame(() => {
      editToggleRef.current?.focus();
    });

    return () => {
      window.clearTimeout(morphTimer);
      cancelAnimationFrame(frame);
    };
  }, [isHomeGridEditing]);

  const renderHomeGridWidget = useCallback(
    (definition: widgetDefinition, instance: widgetInstance): ReactNode => {
      if (definition.kind === "generated") {
        return (
          <GeneratedWidgetTile
            store={store}
            definition={definition}
            instance={instance}
            onSendPrompt={handleWidgetSendPrompt}
            onOpenLink={handleWidgetOpenLink}
          />
        );
      }

      if (definition.kind !== "builtin") {
        return null;
      }

      return renderBuiltinWidget({ definition, store, files, recentItems });
    },
    [files, handleWidgetOpenLink, handleWidgetSendPrompt, recentItems, store],
  );

  const handleReorderWidgets = useCallback(
    (orderedIds: string[]) => {
      reorderWidgetInstances({ store, orderedIds });
    },
    [store],
  );

  const handleResizeWidget = useCallback(
    (instanceId: string, columnSpan: number, rowSpan: number) => {
      const current = homeGridTiles.find((tile) => tile.instance.id === instanceId)?.instance;
      if (!current) {
        return;
      }
      resizeWidgetInstance({ store, id: instanceId, columnSpan, rowSpan, current });
    },
    [homeGridTiles, store],
  );

  const handleRemoveWidget = useCallback(
    (instanceId: string) => {
      const removedTile = homeGridTiles.find((tile) => tile.instance.id === instanceId);
      const title = removedTile?.definition?.name ?? "Widget";
      const toastId = crypto.randomUUID();

      runOptimisticViewTransition(() => {
        setOptimisticallyRemovedIds((current) => new Set(current).add(instanceId));
      });
      deleteWidgetInstance({ store, id: instanceId });

      addToast({
        id: toastId,
        title: `${title} removed`,
        actionProps: {
          children: "Undo",
          onClick: () => {
            runOptimisticViewTransition(() => {
              setOptimisticallyRemovedIds((current) => {
                const next = new Set(current);
                next.delete(instanceId);
                return next;
              });
            });
            restoreWidgetInstance({ store, id: instanceId });
            closeToast(toastId);
          },
        },
      });
    },
    [addToast, closeToast, homeGridTiles, runOptimisticViewTransition, store],
  );

  const handlePlaceWidget = useCallback(
    (input: PlaceWidgetInput, sourceElement: HTMLElement | null) => {
      const sortOrder = nextWidgetInstanceSortOrder(widgetInstanceRows);
      const definition = widgetDefinitionRows.find((row) => row.id === input.definitionId);

      runOptimisticViewTransition(
        () => {
          if (definition) {
            const optimisticInstance: widgetInstance = {
              id: input.id,
              definitionId: input.definitionId,
              sortOrder,
              params: JSON.stringify(input.params),
              columnSpan: 1,
              rowSpan: 1,
              createdAt: new Date(),
              updatedAt: new Date(),
              deletedAt: null,
            };
            setOptimisticInstances((current) => [
              ...current,
              { instance: optimisticInstance, definition },
            ]);
          }
          // Closing the drawer exposes the destination slot while the preview travels to it.
          setIsAddWidgetOpen(false);
        },
        sourceElement
          ? {
              element: sourceElement,
              name: getHomeGridTileViewTransitionName(input.id),
            }
          : undefined,
        () => {
          createWidgetInstance({
            store,
            input: {
              id: input.id,
              definitionId: input.definitionId,
              sortOrder,
              params: input.params,
            },
          });
        },
      );
    },
    [runOptimisticViewTransition, store, widgetDefinitionRows, widgetInstanceRows],
  );

  const handleRenameDefinition = useCallback(
    (id: string, name: string) => {
      const definition = widgetDefinitionRows.find((row) => row.id === id);
      updateWidgetDefinition({ store, input: { id, name }, definition, files: fileRows });
    },
    [fileRows, store, widgetDefinitionRows],
  );

  const handleDeleteDefinition = useCallback((id: string) => {
    setPendingDeleteDefinitionId(id);
  }, []);

  const handleConfirmDeleteDefinition = useCallback(() => {
    if (!pendingDeleteDefinitionId) {
      return;
    }

    const definition = widgetDefinitionRows.find((row) => row.id === pendingDeleteDefinitionId);
    deleteWidgetDefinition({
      store,
      id: pendingDeleteDefinitionId,
      folderId: definition?.folderId ?? null,
      folders: folderRows,
      files: fileRows,
      instances: widgetInstanceRows,
    });
    setPendingDeleteDefinitionId(null);
  }, [
    fileRows,
    folderRows,
    pendingDeleteDefinitionId,
    store,
    widgetDefinitionRows,
    widgetInstanceRows,
  ]);

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
              <LayoutGroup id="dashboard-home-actions">
                <motion.div
                  layout={reducedMotion ? false : "position"}
                  transition={{
                    layout: {
                      duration: ACTION_MORPH_DURATION,
                      ease: ACTION_LAYOUT_EASE,
                    },
                  }}
                  {...stylex.props(styles.menuMotionItem)}
                >
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
                </motion.div>
                {hasHomeGridTiles && (
                  <div
                    {...stylex.props(styles.actionMorph)}
                    style={
                      isHomeGridActionMorphing && !reducedMotion
                        ? { filter: "url(#home-grid-action-metaball)" }
                        : undefined
                    }
                  >
                    <svg
                      aria-hidden="true"
                      focusable="false"
                      {...stylex.props(styles.actionFilterDefinition)}
                    >
                      <defs>
                        <filter
                          id="home-grid-action-metaball"
                          x="-50%"
                          y="-50%"
                          width="200%"
                          height="200%"
                          colorInterpolationFilters="sRGB"
                        >
                          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
                          <feColorMatrix
                            in="blur"
                            mode="matrix"
                            values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 18 -7"
                            result="goo"
                          />
                          <feBlend in="SourceGraphic" in2="goo" />
                        </filter>
                      </defs>
                    </svg>
                    {/* Add widget really travels under the toggle rather than being clipped at its
                        edge: it collapses to a nub narrower than the toggle, and a negative margin
                        equal to that nub parks it exactly on the toggle's left edge, where the
                        toggle's own stacking level hides it before it unmounts. The pill never
                        fades, because the metaball threshold (18a - 7) drops anything under ~0.4
                        alpha and would kill the bridge right as the two overlap. The label fades
                        well before the pill is narrow enough to let it spill past the toggle. */}
                    <AnimatePresence initial={false}>
                      {isHomeGridEditing && (
                        <MotionToolbarButton
                          key="home-grid-add-widget-action"
                          className={stylex.props(styles.actionMotionPill).className}
                          initial={reducedMotion ? { opacity: 0 } : ACTION_PILL_TUCKED}
                          animate={reducedMotion ? { opacity: 1 } : ACTION_PILL_OPEN}
                          exit={reducedMotion ? { opacity: 0 } : ACTION_PILL_TUCKED}
                          transition={{
                            duration: reducedMotion
                              ? ACTION_REDUCED_MOTION_DURATION
                              : ACTION_MORPH_DURATION,
                            ease: ACTION_SPLIT_EASE,
                          }}
                          onClick={() => setIsAddWidgetOpen(true)}
                        >
                          <motion.span
                            initial={reducedMotion ? { opacity: 0 } : ACTION_LABEL_HIDDEN}
                            animate={reducedMotion ? { opacity: 1 } : ACTION_LABEL_SHOWN}
                            exit={reducedMotion ? { opacity: 0 } : ACTION_LABEL_HIDDEN}
                            transition={{
                              duration: reducedMotion
                                ? ACTION_REDUCED_MOTION_DURATION
                                : ACTION_MORPH_DURATION * ACTION_MORPH_LABEL_RATIO,
                              ease: ACTION_SPLIT_EASE,
                            }}
                            {...stylex.props(styles.actionButtonContent, styles.actionMotionPill)}
                          >
                            <span {...stylex.props(styles.triggerIconShell)}>
                              <PlusIcon
                                className={stylex.props(styles.menuIcon).className}
                                weight="regular"
                              />
                            </span>
                            <span>Add widget</span>
                          </motion.span>
                        </MotionToolbarButton>
                      )}
                    </AnimatePresence>
                    <DashboardToolbarButton
                      ref={editToggleRef}
                      className={stylex.props(styles.actionToggle).className}
                      tone="primary"
                      onClick={() => setIsHomeGridEditing(!isHomeGridEditing)}
                    >
                      {/* Done blurs in when edit mode starts; Edit renders at its final state as
                          soon as edit mode ends. No AnimatePresence: the button is not a positioned
                          ancestor, so an exiting label would be placed against the container. */}
                      <motion.span
                        key={isToggleShowingDone ? "done" : "edit"}
                        initial={
                          !isToggleShowingDone
                            ? false
                            : reducedMotion
                              ? { opacity: 0 }
                              : { opacity: 0, filter: "blur(6px)" }
                        }
                        animate={{ opacity: 1, filter: "blur(0px)" }}
                        transition={{
                          duration: reducedMotion
                            ? ACTION_REDUCED_MOTION_DURATION
                            : ACTION_MORPH_DURATION,
                          ease: ACTION_SPLIT_EASE,
                        }}
                        {...stylex.props(styles.actionButtonContent)}
                      >
                        {isToggleShowingDone ? (
                          <>
                            <span
                              {...stylex.props(
                                styles.triggerIconShell,
                                styles.primaryTriggerIconShell,
                              )}
                            >
                              <CheckIcon
                                className={stylex.props(styles.menuIcon).className}
                                weight="bold"
                              />
                            </span>
                            <span>Done</span>
                          </>
                        ) : (
                          <>
                            <span
                              {...stylex.props(
                                styles.triggerIconShell,
                                styles.primaryTriggerIconShell,
                              )}
                            >
                              <PaintBrushBroadIcon
                                className={stylex.props(styles.menuIcon).className}
                                weight="regular"
                              />
                            </span>
                            <span>Edit</span>
                          </>
                        )}
                      </motion.span>
                    </DashboardToolbarButton>
                  </div>
                )}
              </LayoutGroup>
            </div>

            <motion.div {...getSectionMotion(0.08)}>
              <HomeGrid
                tiles={homeGridTiles}
                renderWidget={renderHomeGridWidget}
                onReorder={handleReorderWidgets}
                onRemove={handleRemoveWidget}
                onResize={handleResizeWidget}
                onAddWidget={() => setIsAddWidgetOpen(true)}
                isEditing={isHomeGridEditing}
                onEditingChange={setIsHomeGridEditing}
                showToolbar={false}
                reducedMotion={reducedMotion}
              />
            </motion.div>
          </div>
        </div>
      </motion.div>
      <AddWidgetDrawer
        open={isAddWidgetOpen}
        definitions={widgetDefinitionRows}
        placedDefinitionIds={placedDefinitionIds}
        store={store}
        files={files}
        recentItems={recentItems}
        onOpenChange={setIsAddWidgetOpen}
        onPlace={handlePlaceWidget}
        onRename={handleRenameDefinition}
        onDelete={handleDeleteDefinition}
      />
      <ConfirmDialog
        isOpen={pendingWidgetLinkUrl !== null}
        title="Open this link?"
        description={pendingWidgetLinkUrl ?? ""}
        confirmLabel="Open link"
        onConfirm={handleConfirmWidgetLink}
        onCancel={() => setPendingWidgetLinkUrl(null)}
      />
      <ConfirmDialog
        isOpen={pendingDeleteDefinitionId !== null}
        title="Delete this widget?"
        description="This removes the saved definition and any places it's currently on your Home Grid. This action cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={handleConfirmDeleteDefinition}
        onCancel={() => setPendingDeleteDefinitionId(null)}
      />
      <ToastStack
        render={(toast) => (
          <Toast.Content {...stylex.props(styles.toast)}>
            <Toast.Title {...stylex.props(styles.toastTitle)}>{toast.title as string}</Toast.Title>
            <Toast.Action {...stylex.props(styles.toastAction)} />
          </Toast.Content>
        )}
      />
    </div>
  );
};
