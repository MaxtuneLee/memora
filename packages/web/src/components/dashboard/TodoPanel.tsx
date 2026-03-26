import { CheckIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";

import { cn } from "@/lib/cn";
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

const EmptyTodoSection = ({ copy }: { copy: string }): ReactElement => {
  return (
    <p className="rounded-2xl border border-dashed border-[#e8e1d5] bg-[#fcfaf5] px-3 py-3 text-sm leading-6 text-[#857d72]">
      {copy}
    </p>
  );
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
      className="grid grid-cols-[18px_minmax(0,1fr)] gap-3 py-2"
    >
      <input
        type="checkbox"
        checked={task.done}
        onChange={() => onToggle(task.id)}
        className="peer sr-only"
      />
      <motion.span
        className={cn(
          "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border transition",
          task.done
            ? "border-[#7b875a] bg-[#7b875a] text-[#fffdfa]"
            : "border-[#d3ccbf] bg-[#fffdfa] text-transparent",
        )}
      >
        <motion.span
          animate={
            reducedMotion
              ? undefined
              : {
                  opacity: task.done ? 1 : 0.45,
                }
          }
          transition={
            reducedMotion ? undefined : { duration: 0.18, ease: PANEL_EASE }
          }
        >
          <CheckIcon className="size-3.5" weight="bold" />
        </motion.span>
      </motion.span>
      <span
        className={cn(
          "min-w-0 text-sm leading-6 whitespace-pre-wrap",
          task.done
            ? "text-[#a59f95] line-through decoration-[#c8c2b8]"
            : "text-memora-text",
        )}
      >
        {task.text}
      </span>
    </motion.label>
  );
};

export function TodoPanel({
  files,
  store,
}: {
  files: FileMeta[];
  store: TodoPanelStore;
}): ReactElement {
  const [draft, setDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [retryNonce, setRetryNonce] = useState(0);
  const composerInputRef = useRef<HTMLInputElement | null>(null);
  const filesRef = useRef(files);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const latestMutationIdRef = useRef(0);
  const confirmedSnapshotRef = useRef<TodoDocumentSnapshot | null>(null);
  const reducedMotion = useReducedMotion();

  filesRef.current = files;

  const todoFileId = useMemo(() => {
    return findTodoDocument(files)?.id ?? null;
  }, [files]);
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
  }, [retryNonce, store, todoFileId]);

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
    <div className="rounded-[1.7rem] border border-[#e9e5dc] bg-white p-5 md:p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[17px] font-bold text-memora-text">
            Today Tasks
          </h2>
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
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#e5ddd1] bg-[#fbf8f1] text-[#6f6b62] transition hover:bg-[#f4efe5] hover:text-[#302e2a]"
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
              <XIcon className="size-4" weight="bold" />
            ) : (
              <PlusIcon className="size-4" weight="bold" />
            )}
          </motion.span>
        </motion.button>
      </div>

      {status === "error" ? (
        <motion.div
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={reducedMotion ? undefined : { opacity: 1 }}
          transition={{ duration: 0.26, ease: PANEL_EASE }}
          className="rounded-2xl border border-[#eadfd6] bg-[#fdf6f1] px-4 py-4"
        >
          <p className="text-sm font-semibold text-[#7b4f39]">{errorMessage}</p>
          <button
            type="button"
            onClick={() => setRetryNonce((current) => current + 1)}
            className="mt-3 inline-flex min-h-10 items-center rounded-full border border-[#e7d7ca] bg-[#fff9f4] px-4 text-sm font-semibold text-[#6b4e3f] transition hover:bg-[#fff4ec]"
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
                className="overflow-hidden"
              >
                <div className="p-1">
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
                    className="h-11 w-full rounded-full border border-[#e1d9cd] bg-[#fffdfa] px-4 text-sm text-memora-text outline-none transition placeholder:text-[#aaa297] focus:border-[#a7af8f] focus:ring-2 focus:ring-[#dfe5cb]"
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
                className="rounded-2xl border border-[#eadfd6] bg-[#fdf6f1] px-4 py-3 text-sm text-[#7b4f39]"
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
              className="rounded-2xl border border-dashed border-[#e8e1d5] bg-[#fcfaf5] px-4 py-6 text-sm text-[#857d72]"
            >
              Loading your task note...
            </motion.p>
          ) : (
            <motion.div
              layout={!reducedMotion}
              className="space-y-4"
              transition={
                reducedMotion
                  ? undefined
                  : { layout: { duration: 0.32, ease: PANEL_EASE } }
              }
            >
              <motion.section layout={!reducedMotion} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[11px] font-bold tracking-[0.14em] text-[#8f897d] uppercase">
                    Open
                  </h3>
                  <motion.span
                    key={`open-count-${groupedTasks.open.length}`}
                    initial={reducedMotion ? false : { opacity: 0 }}
                    animate={reducedMotion ? undefined : { opacity: 1 }}
                    transition={{ duration: 0.2, ease: PANEL_EASE }}
                    className="text-xs text-[#9b9487]"
                  >
                    {groupedTasks.open.length}
                  </motion.span>
                </div>
                {groupedTasks.open.length > 0 ? (
                  <motion.div layout={!reducedMotion} className="space-y-1">
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
                className="space-y-2 border-t border-[#eee7db] pt-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[11px] font-bold tracking-[0.14em] text-[#8f897d] uppercase">
                    Done
                  </h3>
                  <motion.span
                    key={`done-count-${groupedTasks.done.length}`}
                    initial={reducedMotion ? false : { opacity: 0 }}
                    animate={reducedMotion ? undefined : { opacity: 1 }}
                    transition={{ duration: 0.2, ease: PANEL_EASE }}
                    className="text-xs text-[#9b9487]"
                  >
                    {groupedTasks.done.length}
                  </motion.span>
                </div>
                {groupedTasks.done.length > 0 ? (
                  <motion.div layout={!reducedMotion} className="space-y-1">
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
