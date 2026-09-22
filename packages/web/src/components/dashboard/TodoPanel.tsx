import { CheckIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import type { ReactElement } from "react";

import type { FileMeta } from "@/types/library";

import {
  ensureTodoDocument,
  findTodoDocument,
  saveTodoDocument,
  type TodoDocumentSnapshot,
} from "./todoDocument";
import {
  createTodoTask,
  getNextComposerStateAfterEscape,
  getNextComposerStateAfterSubmit,
  splitTodoTasks,
  toggleTodoTask,
} from "./todoPanelState";
import type { TodoTask } from "./todoMarkdown";

interface TodoPanelStore {
  commit: (...events: unknown[]) => void;
}

const TODO_LOAD_ERROR = "Couldn't load today’s tasks.";
const TODO_SAVE_ERROR = "Couldn't save today’s tasks.";
const PANEL_EASE = [0.22, 1, 0.36, 1] as const;
const COMPOSER_COLLAPSED_HEIGHT = 0;
const COMPOSER_EXPANDED_HEIGHT = 52;
const COMPOSER_EXPANDED_MARGIN_BOTTOM = 20;

const styles = stylex.create({
  emptySection: {
    backgroundColor: "#fcfaf5",
    border: "1px dashed #e8e1d5",
    borderRadius: 16,
    color: "#857d72",
    fontSize: 14,
    lineHeight: "24px",
    padding: 12,
  },
  taskRow: {
    display: "grid",
    gap: 12,
    gridTemplateColumns: "18px minmax(0, 1fr)",
    paddingBlock: 8,
  },
  visuallyHidden: {
    clipPath: "inset(50%)",
    height: 1,
    margin: -1,
    overflow: "hidden",
    padding: 0,
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },
  checkbox: {
    alignItems: "center",
    backgroundColor: "#fffdfa",
    border: "1px solid #d3ccbf",
    borderRadius: 6,
    color: "transparent",
    display: "flex",
    height: 18,
    justifyContent: "center",
    marginTop: 2,
    flexShrink: 0,
    transition: "all 150ms",
    width: 18,
  },
  checkboxDone: { backgroundColor: "#7b875a", borderColor: "#7b875a", color: "#fffdfa" },
  checkIcon: { height: 14, width: 14 },
  taskText: {
    color: "#1d1c1a",
    fontSize: 14,
    lineHeight: "24px",
    minWidth: 0,
    whiteSpace: "pre-wrap",
  },
  taskTextDone: {
    color: "#a59f95",
    textDecoration: "line-through",
    textDecorationColor: "#c8c2b8",
  },
  panel: {
    backgroundColor: "white",
    border: "1px solid #e9e5dc",
    borderRadius: "inherit",
    padding: 20,
    "@media (min-width: 48rem)": { padding: 24 },
  },
  panelHeader: {
    alignItems: "flex-start",
    display: "flex",
    gap: 16,
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: { color: "#1d1c1a", fontSize: 17, fontWeight: 700 },
  addButton: {
    alignItems: "center",
    backgroundColor: "#fbf8f1",
    border: "1px solid #e5ddd1",
    borderRadius: 9999,
    color: "#6f6b62",
    display: "inline-flex",
    flexShrink: 0,
    height: 36,
    justifyContent: "center",
    transition: "color 150ms, background-color 150ms",
    width: 36,
    ":hover": { backgroundColor: "#f4efe5", color: "#302e2a" },
  },
  icon: { height: 16, width: 16 },
  errorPanel: {
    backgroundColor: "#fdf6f1",
    border: "1px solid #eadfd6",
    borderRadius: 16,
    padding: 16,
  },
  errorText: { color: "#7b4f39", fontSize: 14, fontWeight: 600 },
  retryButton: {
    alignItems: "center",
    backgroundColor: "#fff9f4",
    border: "1px solid #e7d7ca",
    borderRadius: 9999,
    color: "#6b4e3f",
    display: "inline-flex",
    fontSize: 14,
    fontWeight: 600,
    marginTop: 12,
    minHeight: 40,
    paddingInline: 16,
    transition: "background-color 150ms",
    ":hover": { backgroundColor: "#fff4ec" },
  },
  composer: { overflow: "hidden" },
  composerPadding: { padding: 4 },
  composerInput: {
    backgroundColor: "#fffdfa",
    border: "1px solid #e1d9cd",
    borderRadius: 9999,
    color: "#1d1c1a",
    fontSize: 14,
    height: 44,
    outline: "none",
    paddingInline: 16,
    transition: "border-color 150ms, box-shadow 150ms",
    width: "100%",
    "::placeholder": { color: "#aaa297" },
    ":focus": { borderColor: "#a7af8f", boxShadow: "0 0 0 2px #dfe5cb" },
  },
  inlineError: {
    backgroundColor: "#fdf6f1",
    border: "1px solid #eadfd6",
    borderRadius: 16,
    color: "#7b4f39",
    fontSize: 14,
    paddingBlock: 12,
    paddingInline: 16,
  },
  loading: {
    backgroundColor: "#fcfaf5",
    border: "1px dashed #e8e1d5",
    borderRadius: 16,
    color: "#857d72",
    fontSize: 14,
    paddingBlock: 24,
    paddingInline: 16,
  },
  taskSections: { display: "flex", flexDirection: "column", gap: 16 },
  taskSection: { display: "flex", flexDirection: "column", gap: 8 },
  doneSection: { borderTop: "1px solid #eee7db", paddingTop: 16 },
  sectionHeader: {
    alignItems: "center",
    display: "flex",
    gap: 12,
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: "#8f897d",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  count: { color: "#9b9487", fontSize: 12 },
  taskList: { display: "flex", flexDirection: "column", gap: 4 },
});

const EmptyTodoSection = ({ copy }: { copy: string }): ReactElement => {
  return <p {...stylex.props(styles.emptySection)}>{copy}</p>;
};

const TodoTaskRow = ({
  task,
  onToggle,
  reducedMotion,
}: {
  task: TodoTask;
  onToggle: (taskId: string) => void;
  reducedMotion: boolean;
}): ReactElement => {
  return (
    <motion.label
      layout={!reducedMotion}
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={reducedMotion ? undefined : { opacity: 1 }}
      exit={reducedMotion ? undefined : { opacity: 0 }}
      transition={
        reducedMotion
          ? undefined
          : {
              duration: 0.28,
              ease: PANEL_EASE,
              layout: { duration: 0.3, ease: PANEL_EASE },
            }
      }
      whileHover={reducedMotion ? undefined : { x: 2 }}
      {...stylex.props(styles.taskRow)}
    >
      <input
        type="checkbox"
        checked={task.done}
        onChange={() => onToggle(task.id)}
        {...stylex.props(styles.visuallyHidden)}
      />
      <motion.span {...stylex.props(styles.checkbox, task.done && styles.checkboxDone)}>
        <motion.span
          animate={
            reducedMotion
              ? undefined
              : {
                  opacity: task.done ? 1 : 0.45,
                }
          }
          transition={reducedMotion ? undefined : { duration: 0.18, ease: PANEL_EASE }}
        >
          <CheckIcon className={stylex.props(styles.checkIcon).className} weight="bold" />
        </motion.span>
      </motion.span>
      <span {...stylex.props(styles.taskText, task.done && styles.taskTextDone)}>{task.text}</span>
    </motion.label>
  );
};

export function TodoPanel({
  files,
  store,
  todoFolderId = null,
}: {
  files: FileMeta[];
  store: TodoPanelStore;
  todoFolderId?: string | null;
}): ReactElement {
  const [draft, setDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retryNonce, setRetryNonce] = useState(0);
  const composerInputRef = useRef<HTMLInputElement | null>(null);
  const filesRef = useRef(files);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const latestMutationIdRef = useRef(0);
  const confirmedSnapshotRef = useRef<TodoDocumentSnapshot | null>(null);
  const reducedMotion = useReducedMotion();

  filesRef.current = files;

  const todoFileId = useMemo(() => {
    return findTodoDocument(files, todoFolderId)?.id ?? null;
  }, [files, todoFolderId]);
  const groupedTasks = useMemo(() => splitTodoTasks(tasks), [tasks]);

  useEffect(() => {
    if (!isComposerOpen) {
      return;
    }

    composerInputRef.current?.focus();
  }, [isComposerOpen]);

  useEffect(() => {
    let cancelled = false;

    const loadTodoDocument = async () => {
      setStatus("loading");
      setErrorMessage(null);

      try {
        const snapshot = await ensureTodoDocument({
          files: filesRef.current,
          store,
          todoFolderId,
        });

        if (cancelled) {
          return;
        }

        confirmedSnapshotRef.current = snapshot;
        setTasks(snapshot.tasks);
        setStatus("ready");
      } catch (error) {
        console.error("Failed to load dashboard todo document:", error);
        if (cancelled) {
          return;
        }

        confirmedSnapshotRef.current = null;
        setTasks([]);
        setStatus("error");
        setErrorMessage(TODO_LOAD_ERROR);
      }
    };

    void loadTodoDocument();

    return () => {
      cancelled = true;
    };
  }, [retryNonce, store, todoFileId, todoFolderId]);

  const queuePersist = useCallback(
    (nextTasks: TodoTask[], rollbackSnapshot: TodoDocumentSnapshot) => {
      const mutationId = ++latestMutationIdRef.current;

      saveChainRef.current = saveChainRef.current
        .catch(() => undefined)
        .then(async () => {
          const rollbackBase = confirmedSnapshotRef.current ?? rollbackSnapshot;

          try {
            const result = await saveTodoDocument({
              file: rollbackBase.file,
              tasks: nextTasks,
              store,
            });

            confirmedSnapshotRef.current = result;
            if (mutationId !== latestMutationIdRef.current) {
              return;
            }

            setTasks(result.tasks);
            setErrorMessage(null);
          } catch (error) {
            console.error("Failed to save dashboard todo document:", error);
            if (mutationId !== latestMutationIdRef.current) {
              return;
            }

            confirmedSnapshotRef.current = rollbackBase;
            setTasks(rollbackBase.tasks);
            setErrorMessage(TODO_SAVE_ERROR);
          }
        });
    },
    [store],
  );

  const handleAdd = useCallback(() => {
    const nextTask = createTodoTask(draft);
    const rollbackSnapshot = confirmedSnapshotRef.current;

    if (!nextTask || !rollbackSnapshot) {
      return;
    }

    const nextTasks = [nextTask, ...tasks];
    setDraft("");
    setIsComposerOpen(
      getNextComposerStateAfterSubmit({
        isComposerOpen,
        submitted: true,
      }),
    );
    setErrorMessage(null);
    setTasks(nextTasks);
    queuePersist(nextTasks, rollbackSnapshot);
  }, [draft, isComposerOpen, queuePersist, tasks]);

  const handleToggle = useCallback(
    (taskId: string) => {
      const rollbackSnapshot = confirmedSnapshotRef.current;
      if (!rollbackSnapshot) {
        return;
      }

      const nextTasks = toggleTodoTask(tasks, taskId);
      setErrorMessage(null);
      setTasks(nextTasks);
      queuePersist(nextTasks, rollbackSnapshot);
    },
    [queuePersist, tasks],
  );

  return (
    <div {...stylex.props(styles.panel)}>
      <div {...stylex.props(styles.panelHeader)}>
        <div>
          <h2 {...stylex.props(styles.title)}>Today Tasks</h2>
        </div>
        <motion.button
          type="button"
          onClick={() => {
            if (isComposerOpen) {
              setDraft("");
              setIsComposerOpen(getNextComposerStateAfterEscape());
              return;
            }

            setIsComposerOpen(true);
          }}
          {...stylex.props(styles.addButton)}
          aria-label={isComposerOpen ? "Close task input" : "Add task"}
          whileHover={reducedMotion ? undefined : { y: -1, scale: 1.04 }}
          whileTap={reducedMotion ? undefined : { scale: 0.94 }}
          transition={{ duration: 0.18, ease: PANEL_EASE }}
        >
          <motion.span
            animate={
              reducedMotion
                ? undefined
                : {
                    rotate: isComposerOpen ? 90 : 0,
                    scale: isComposerOpen ? 1.02 : 1,
                  }
            }
            transition={{ duration: 0.24, ease: PANEL_EASE }}
          >
            {isComposerOpen ? (
              <XIcon className={stylex.props(styles.icon).className} weight="bold" />
            ) : (
              <PlusIcon className={stylex.props(styles.icon).className} weight="bold" />
            )}
          </motion.span>
        </motion.button>
      </div>

      {status === "error" ? (
        <motion.div
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={reducedMotion ? undefined : { opacity: 1 }}
          transition={{ duration: 0.26, ease: PANEL_EASE }}
          {...stylex.props(styles.errorPanel)}
        >
          <p {...stylex.props(styles.errorText)}>{errorMessage}</p>
          <button
            type="button"
            onClick={() => setRetryNonce((current) => current + 1)}
            {...stylex.props(styles.retryButton)}
          >
            Try again
          </button>
        </motion.div>
      ) : (
        <div>
          <AnimatePresence initial={false}>
            {isComposerOpen ? (
              <motion.div
                key="todo-composer"
                initial={
                  reducedMotion
                    ? false
                    : {
                        height: COMPOSER_COLLAPSED_HEIGHT,
                        marginBottom: 0,
                      }
                }
                animate={
                  reducedMotion
                    ? undefined
                    : {
                        height: COMPOSER_EXPANDED_HEIGHT,
                        marginBottom: COMPOSER_EXPANDED_MARGIN_BOTTOM,
                      }
                }
                exit={
                  reducedMotion
                    ? undefined
                    : {
                        height: COMPOSER_COLLAPSED_HEIGHT,
                        marginBottom: 0,
                      }
                }
                transition={{ duration: 0.28, ease: PANEL_EASE }}
                {...stylex.props(styles.composer)}
              >
                <div {...stylex.props(styles.composerPadding)}>
                  <input
                    ref={composerInputRef}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleAdd();
                      }

                      if (event.key === "Escape") {
                        setDraft("");
                        setIsComposerOpen(getNextComposerStateAfterEscape());
                      }
                    }}
                    placeholder="Add a task for today..."
                    {...stylex.props(styles.composerInput)}
                  />
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {errorMessage ? (
              <motion.p
                key="todo-save-error"
                initial={reducedMotion ? false : { opacity: 0 }}
                animate={reducedMotion ? undefined : { opacity: 1 }}
                exit={reducedMotion ? undefined : { opacity: 0 }}
                transition={{ duration: 0.22, ease: PANEL_EASE }}
                {...stylex.props(styles.inlineError)}
              >
                {errorMessage}
              </motion.p>
            ) : null}
          </AnimatePresence>

          {status === "loading" ? (
            <motion.p
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={reducedMotion ? undefined : { opacity: 1 }}
              transition={{ duration: 0.3, ease: PANEL_EASE }}
              {...stylex.props(styles.loading)}
            >
              Loading your task note...
            </motion.p>
          ) : (
            <motion.div
              layout={!reducedMotion}
              {...stylex.props(styles.taskSections)}
              transition={
                reducedMotion ? undefined : { layout: { duration: 0.32, ease: PANEL_EASE } }
              }
            >
              <motion.section layout={!reducedMotion} {...stylex.props(styles.taskSection)}>
                <div {...stylex.props(styles.sectionHeader)}>
                  <h3 {...stylex.props(styles.sectionTitle)}>Open</h3>
                  <motion.span
                    key={`open-count-${groupedTasks.open.length}`}
                    initial={reducedMotion ? false : { opacity: 0 }}
                    animate={reducedMotion ? undefined : { opacity: 1 }}
                    transition={{ duration: 0.2, ease: PANEL_EASE }}
                    {...stylex.props(styles.count)}
                  >
                    {groupedTasks.open.length}
                  </motion.span>
                </div>
                {groupedTasks.open.length > 0 ? (
                  <motion.div layout={!reducedMotion} {...stylex.props(styles.taskList)}>
                    <AnimatePresence initial={false} mode="popLayout">
                      {groupedTasks.open.map((task) => (
                        <TodoTaskRow
                          key={task.id}
                          task={task}
                          onToggle={handleToggle}
                          reducedMotion={Boolean(reducedMotion)}
                        />
                      ))}
                    </AnimatePresence>
                  </motion.div>
                ) : (
                  <EmptyTodoSection copy="Nothing open yet. Add the first task above." />
                )}
              </motion.section>

              <motion.section
                layout={!reducedMotion}
                {...stylex.props(styles.taskSection, styles.doneSection)}
              >
                <div {...stylex.props(styles.sectionHeader)}>
                  <h3 {...stylex.props(styles.sectionTitle)}>Done</h3>
                  <motion.span
                    key={`done-count-${groupedTasks.done.length}`}
                    initial={reducedMotion ? false : { opacity: 0 }}
                    animate={reducedMotion ? undefined : { opacity: 1 }}
                    transition={{ duration: 0.2, ease: PANEL_EASE }}
                    {...stylex.props(styles.count)}
                  >
                    {groupedTasks.done.length}
                  </motion.span>
                </div>
                {groupedTasks.done.length > 0 ? (
                  <motion.div layout={!reducedMotion} {...stylex.props(styles.taskList)}>
                    <AnimatePresence initial={false} mode="popLayout">
                      {groupedTasks.done.map((task) => (
                        <TodoTaskRow
                          key={task.id}
                          task={task}
                          onToggle={handleToggle}
                          reducedMotion={Boolean(reducedMotion)}
                        />
                      ))}
                    </AnimatePresence>
                  </motion.div>
                ) : (
                  <EmptyTodoSection copy="Completed tasks will collect here." />
                )}
              </motion.section>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
