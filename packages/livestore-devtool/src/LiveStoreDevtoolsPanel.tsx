import { useStore } from "@livestore/react";
import { dir } from "@memora/fs";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

const DEFAULT_STORAGE_PATH = "/livestore-main@4";
const DEFAULT_POLL_INTERVAL_MS = 4_000;
const DEFAULT_MAX_ROWS = 50;
const DEFAULT_COLUMN_WIDTH = 148;
const SIDEBAR_WIDTH = 252;
const DETAILS_WIDTH = 272;

const APP_BG = "#f0f2f5";
const SURFACE = "#ffffff";
const SURFACE_SUBTLE = "#f7f8fa";
const SURFACE_MUTED = "#edf1f5";
const BORDER = "#d6dce5";
const BORDER_STRONG = "#c7d0db";
const TEXT = "#1c2430";
const TEXT_MUTED = "#647488";
const TEXT_SOFT = "#8a98a9";
const ACCENT = "#2563eb";
const ACCENT_SOFT = "#dbeafe";
const SUCCESS = "#117a55";
const WARNING = "#b45309";
const DANGER = "#b42318";

type QueryRow = Record<string, unknown>;

export interface LiveStoreDevtoolsColumn {
  key: string;
  label?: string;
  mono?: boolean;
  truncate?: boolean;
}

export interface LiveStoreDevtoolsQuerySection {
  id: string;
  title: string;
  query: string;
  description?: string;
  emptyMessage?: string;
  columns?: LiveStoreDevtoolsColumn[];
}

export interface LiveStoreDevtoolsPanelProps {
  currentPath?: string;
  title?: string;
  storagePath?: string;
  pollIntervalMs?: number;
  maxRows?: number;
}

interface QuerySectionState<TRow = QueryRow> {
  rows: TRow[];
  updatedAt: number | null;
  error: string | null;
}

interface OpfsTreeNode {
  kind: "file" | "dir";
  name: string;
  path: string;
  sizeBytes: number;
  children?: OpfsTreeNode[];
}

interface OpfsSnapshot {
  rootPath: string;
  exists: boolean;
  totalBytes: number;
  generatedAt: number | null;
  error: string | null;
  tree: OpfsTreeNode[];
}

interface TableInfoRow {
  name: string;
  type: string;
  sql?: string | null;
}

interface TableColumnRow {
  cid: number;
  name: string;
  type: string;
  notNull: number;
  defaultValue: unknown;
  pk: number;
}

interface SqlResultState {
  rows: QueryRow[];
  error: string | null;
  updatedAt: number | null;
  durationMs: number | null;
  statement: string;
  kind: "read" | "write" | null;
}

type ResultMode = "table" | "sql";

interface SelectedCellState {
  rowIndex: number;
  column: string;
  value: string;
}

interface EditingCellState {
  rowIndex: number;
  column: string;
  draft: string;
}

interface ColumnResizeState {
  column: string;
  startX: number;
  startWidth: number;
}

const sortTables = (tables: TableInfoRow[]): TableInfoRow[] => {
  return [...tables].sort((left, right) => {
    const leftInternal = left.name.startsWith("__livestore");
    const rightInternal = right.name.startsWith("__livestore");
    if (leftInternal !== rightInternal) {
      return leftInternal ? 1 : -1;
    }
    return left.name.localeCompare(right.name);
  });
};

const formatBytes = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let current = value;
  let unitIndex = 0;
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }

  const digits = current >= 100 || unitIndex === 0 ? 0 : current >= 10 ? 1 : 2;
  return `${current.toFixed(digits)} ${units[unitIndex]}`;
};

const formatTimestamp = (value: number | null): string => {
  if (!value) {
    return "Never";
  }

  return new Date(value).toLocaleString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    month: "short",
    day: "numeric",
  });
};

const formatCellValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NaN";
  }

  if (typeof value === "string") {
    return value.length > 0 ? value : '""';
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return Object.prototype.toString.call(value);
  }
};

const escapeSqlString = (value: string): string => {
  return `'${value.replace(/'/g, "''")}'`;
};

const quoteIdentifier = (value: string): string => {
  return `"${value.replace(/"/g, '""')}"`;
};

const sqlLiteral = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Cannot persist a non-finite number.");
    }
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  return escapeSqlString(String(value));
};

const isReadStatement = (sql: string): boolean => {
  return /^(select|pragma|with|explain)\b/i.test(sql.trim());
};

const buildTree = async (
  path: string,
  depth: number,
): Promise<OpfsTreeNode | null> => {
  const directory = dir(path);
  const exists = await directory.exists();
  if (!exists) {
    return null;
  }

  const children = await directory.children();
  const sortedChildren = [...children].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "dir" ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });

  const childNodes = await Promise.all(
    sortedChildren.map(async (child) => {
      if (child.kind === "file") {
        const sizeBytes = child.getSize ? await child.getSize() : 0;
        return {
          kind: "file" as const,
          name: child.name,
          path: child.path,
          sizeBytes,
        };
      }

      if (depth <= 0) {
        return {
          kind: "dir" as const,
          name: child.name,
          path: child.path,
          sizeBytes: 0,
          children: [],
        };
      }

      return buildTree(child.path, depth - 1);
    }),
  );

  const resolvedChildren = childNodes.filter(
    (node): node is OpfsTreeNode => node !== null,
  );
  const sizeBytes = resolvedChildren.reduce(
    (total, child) => total + child.sizeBytes,
    0,
  );

  return {
    kind: "dir",
    name: path === "/" ? "/" : (path.split("/").pop() ?? path),
    path,
    sizeBytes,
    children: resolvedChildren,
  };
};

const readOpfsSnapshot = async (path: string): Promise<OpfsSnapshot> => {
  try {
    const tree = await buildTree(path, 1);
    if (!tree) {
      return {
        rootPath: path,
        exists: false,
        totalBytes: 0,
        generatedAt: Date.now(),
        error: null,
        tree: [],
      };
    }

    return {
      rootPath: path,
      exists: true,
      totalBytes: tree.sizeBytes,
      generatedAt: Date.now(),
      error: null,
      tree: tree.children ?? [],
    };
  } catch (error) {
    return {
      rootPath: path,
      exists: false,
      totalBytes: 0,
      generatedAt: Date.now(),
      error: error instanceof Error ? error.message : String(error),
      tree: [],
    };
  }
};

const ShellButton = ({
  children,
  onClick,
  disabled = false,
  tone = "neutral",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "neutral" | "primary";
}) => {
  const backgroundColor = tone === "primary" ? ACCENT : SURFACE;
  const borderColor = tone === "primary" ? ACCENT : BORDER_STRONG;
  const color = tone === "primary" ? "#ffffff" : TEXT;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-sm border px-2.5 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
      style={{ backgroundColor, borderColor, color }}
    >
      {children}
    </button>
  );
};

const PaneSection = ({
  title,
  children,
  extra,
}: {
  title: string;
  children: ReactNode;
  extra?: ReactNode;
}) => {
  return (
    <section className="border-b" style={{ borderBottomColor: BORDER }}>
      <div
        className="flex items-center justify-between gap-2 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em]"
        style={{ color: TEXT_SOFT, backgroundColor: SURFACE_SUBTLE }}
      >
        <span>{title}</span>
        {extra}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
};

const TreeNodeView = ({
  node,
  depth,
}: {
  node: OpfsTreeNode;
  depth: number;
}) => {
  return (
    <div className="space-y-1">
      <div
        className="border px-2 py-1.5 text-[11px]"
        style={{
          marginLeft: depth * 10,
          borderColor: BORDER,
          backgroundColor: depth % 2 === 0 ? SURFACE : SURFACE_SUBTLE,
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate font-mono" style={{ color: TEXT }}>
            {node.kind === "dir" ? "dir" : "file"} · {node.name}
          </span>
          <span className="shrink-0" style={{ color: TEXT_SOFT }}>
            {formatBytes(node.sizeBytes)}
          </span>
        </div>
        <div
          className="mt-1 truncate text-[11px]"
          style={{ color: TEXT_MUTED }}
        >
          {node.path}
        </div>
      </div>
      {node.children?.map((child) => (
        <TreeNodeView key={child.path} node={child} depth={depth + 1} />
      ))}
    </div>
  );
};

const DataTable = ({
  rows,
  fallbackColumns = [],
  emptyMessage,
  editable = false,
  onCommitEdit,
  fillHeight = false,
}: {
  rows: QueryRow[];
  fallbackColumns?: string[];
  emptyMessage: string;
  editable?: boolean;
  onCommitEdit?: (
    rowIndex: number,
    column: string,
    value: string,
  ) => Promise<void> | void;
  fillHeight?: boolean;
}) => {
  const columns =
    rows.length > 0 ? Object.keys(rows[0] ?? {}) : fallbackColumns;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cellRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const resizeStateRef = useRef<ColumnResizeState | null>(null);
  const [selectedCell, setSelectedCell] = useState<SelectedCellState | null>(
    null,
  );
  const [editingCell, setEditingCell] = useState<EditingCellState | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [overlayStyle, setOverlayStyle] = useState<{
    left: number;
    top: number;
    maxWidth: number;
    minWidth: number;
  } | null>(null);

  useEffect(() => {
    setSelectedCell(null);
    setEditingCell(null);
  }, [rows]);

  const updateOverlayPosition = useCallback(() => {
    if (!selectedCell || editingCell) {
      setOverlayStyle(null);
      return;
    }

    const cell =
      cellRefs.current[`${selectedCell.rowIndex}:${selectedCell.column}`];
    const container = containerRef.current;
    if (!cell || !container) {
      setOverlayStyle(null);
      return;
    }

    const cellRect = cell.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const cellLeft = cellRect.left - containerRect.left + container.scrollLeft;
    const cellTop = cellRect.top - containerRect.top + container.scrollTop;
    const overlayHeight =
      overlayRef.current?.getBoundingClientRect().height ?? cellRect.height;
    const top = Math.max(
      container.scrollTop,
      cellTop + cellRect.height - overlayHeight - 1,
    );
    const maxWidth = Math.min(420, Math.max(220, containerRect.width - 24));

    setOverlayStyle({
      left: Math.max(container.scrollLeft, cellLeft),
      top,
      maxWidth,
      minWidth: Math.min(cellRect.width, maxWidth),
    });
  }, [editingCell, selectedCell]);

  useLayoutEffect(() => {
    updateOverlayPosition();
  }, [columnWidths, rows, selectedCell, editingCell, updateOverlayPosition]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const state = resizeStateRef.current;
      if (!state) {
        return;
      }

      setColumnWidths((current) => ({
        ...current,
        [state.column]: Math.max(
          72,
          state.startWidth + event.clientX - state.startX,
        ),
      }));
    };

    const handlePointerUp = () => {
      resizeStateRef.current = null;
      document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const preserveSelection = target.closest(
        '[data-devtools-cell-trigger="true"], [data-devtools-cell-editor="true"]',
      );
      if (preserveSelection) {
        return;
      }

      setSelectedCell(null);
      setEditingCell(null);
    };

    window.addEventListener("pointerdown", handlePointerDown, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, []);

  if (columns.length === 0) {
    return (
      <div className="text-xs" style={{ color: TEXT_MUTED }}>
        {emptyMessage}
      </div>
    );
  }

  const handleCommit = async () => {
    if (!editingCell || !onCommitEdit) {
      return;
    }

    await onCommitEdit(
      editingCell.rowIndex,
      editingCell.column,
      editingCell.draft,
    );
    setSelectedCell({
      rowIndex: editingCell.rowIndex,
      column: editingCell.column,
      value: editingCell.draft,
    });
    setEditingCell(null);
  };

  return (
    <div
      ref={containerRef}
      className={`relative overflow-auto border-t ${fillHeight ? "h-full min-h-0" : ""}`}
      style={{ borderColor: BORDER }}
      onScroll={updateOverlayPosition}
    >
      {selectedCell && overlayStyle && !editingCell ? (
        <div
          ref={overlayRef}
          className="pointer-events-none absolute z-20 overflow-hidden rounded-sm border px-2 py-1 font-mono text-[11px] shadow-sm"
          style={{
            left: overlayStyle.left,
            top: overlayStyle.top,
            maxWidth: overlayStyle.maxWidth,
            minWidth: overlayStyle.minWidth,
            borderColor: "#8bb8ff",
            backgroundColor: "#f7fbff",
            color: TEXT,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          }}
        >
          {selectedCell.value}
        </div>
      ) : null}
      <table className="min-w-full border-separate border-spacing-0 text-left text-[11px]">
        <thead>
          <tr style={{ backgroundColor: SURFACE_MUTED }}>
            {columns.map((column, columnIndex) => (
              <th
                key={column}
                className="group sticky top-0 z-10 border-b px-3 py-1.5 font-medium"
                style={{
                  borderBottomColor: BORDER,
                  backgroundColor: SURFACE_MUTED,
                  color: TEXT,
                  width: `${columnWidths[column] ?? DEFAULT_COLUMN_WIDTH}px`,
                  minWidth: `${columnWidths[column] ?? DEFAULT_COLUMN_WIDTH}px`,
                  maxWidth: `${columnWidths[column] ?? DEFAULT_COLUMN_WIDTH}px`,
                }}
              >
                <div className="flex w-full items-center pr-2">
                  <span className="truncate">{column}</span>
                </div>
                {columnIndex < columns.length - 1 ? (
                  <button
                    type="button"
                    aria-label={`Resize ${column} column`}
                    className="absolute right-0 top-0 z-10 flex h-full items-center justify-center focus:outline-none"
                    style={{ cursor: "col-resize" }}
                    onPointerDown={(event) => {
                      const headerCell = event.currentTarget.closest("th");
                      if (!headerCell) {
                        return;
                      }
                      resizeStateRef.current = {
                        column,
                        startX: event.clientX,
                        startWidth: headerCell.getBoundingClientRect().width,
                      };
                      event.preventDefault();
                    }}
                  >
                    <span
                      className=" w-0.5 h-5 rounded"
                      style={{
                        backgroundColor: "oklch(0.71 0.04 253.13 / 0.34)",
                      }}
                    />
                  </button>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? (
            rows.map((row, rowIndex) => (
              <tr
                key={`row-${rowIndex}`}
                style={{
                  backgroundColor: rowIndex % 2 === 0 ? SURFACE : "#f2f7ff",
                }}
              >
                {columns.map((column) => (
                  <td
                    key={`${rowIndex}-${column}`}
                    className="border-b px-0 py-0 align-top font-mono"
                    style={{
                      borderBottomColor: BORDER,
                      color: TEXT,
                      width: `${columnWidths[column] ?? DEFAULT_COLUMN_WIDTH}px`,
                      minWidth: `${columnWidths[column] ?? DEFAULT_COLUMN_WIDTH}px`,
                      maxWidth: `${columnWidths[column] ?? DEFAULT_COLUMN_WIDTH}px`,
                    }}
                  >
                    {editingCell?.rowIndex === rowIndex &&
                    editingCell.column === column ? (
                      <input
                        autoFocus
                        data-devtools-cell-editor="true"
                        value={editingCell.draft}
                        onChange={(event) =>
                          setEditingCell((current) =>
                            current
                              ? { ...current, draft: event.target.value }
                              : current,
                          )
                        }
                        onBlur={() => {
                          void handleCommit();
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void handleCommit();
                          }
                          if (event.key === "Escape") {
                            setEditingCell(null);
                          }
                        }}
                        className="h-full w-full border-none bg-[#fff8dd] px-3 py-1 text-[11px] outline-none"
                        style={{ color: TEXT }}
                      />
                    ) : (
                      <button
                        ref={(element) => {
                          cellRefs.current[`${rowIndex}:${column}`] = element;
                        }}
                        type="button"
                        data-devtools-cell-trigger="true"
                        onClick={() =>
                          setSelectedCell({
                            rowIndex,
                            column,
                            value: formatCellValue(row[column]),
                          })
                        }
                        onDoubleClick={() => {
                          if (!editable) {
                            return;
                          }

                          setSelectedCell({
                            rowIndex,
                            column,
                            value: formatCellValue(row[column]),
                          });
                          setEditingCell({
                            rowIndex,
                            column,
                            draft:
                              row[column] === null || row[column] === undefined
                                ? ""
                                : String(row[column]),
                          });
                        }}
                        className="block h-full w-full truncate px-3 py-1 text-left"
                        style={{
                          backgroundColor:
                            selectedCell?.rowIndex === rowIndex &&
                            selectedCell.column === column
                              ? "#d9ebff"
                              : "transparent",
                          boxShadow:
                            selectedCell?.rowIndex === rowIndex &&
                            selectedCell.column === column
                              ? "inset 0 0 0 1px #4f9cff"
                              : "none",
                          maxWidth: `${columnWidths[column] ?? DEFAULT_COLUMN_WIDTH}px`,
                        }}
                        title={formatCellValue(row[column])}
                      >
                        {formatCellValue(row[column])}
                      </button>
                    )}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-3 text-[11px]"
                style={{ color: TEXT_MUTED }}
              >
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export function LiveStoreDevtoolsPanel({
  currentPath,
  title = "LiveStore Devtools",
  storagePath = DEFAULT_STORAGE_PATH,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  maxRows = DEFAULT_MAX_ROWS,
}: LiveStoreDevtoolsPanelProps) {
  const { store } = useStore();
  const [tablesState, setTablesState] = useState<
    QuerySectionState<TableInfoRow>
  >({
    rows: [],
    updatedAt: null,
    error: null,
  });
  const [columnsState, setColumnsState] = useState<
    QuerySectionState<TableColumnRow>
  >({
    rows: [],
    updatedAt: null,
    error: null,
  });
  const [rowsState, setRowsState] = useState<QuerySectionState<QueryRow>>({
    rows: [],
    updatedAt: null,
    error: null,
  });
  const [selectedTable, setSelectedTable] = useState("");
  const [tableFilter, setTableFilter] = useState("");
  const [opfsSnapshot, setOpfsSnapshot] = useState<OpfsSnapshot>({
    rootPath: storagePath,
    exists: false,
    totalBytes: 0,
    generatedAt: null,
    error: null,
    tree: [],
  });
  const [sqlInput, setSqlInput] = useState("");
  const [sqlResult, setSqlResult] = useState<SqlResultState>({
    rows: [],
    error: null,
    updatedAt: null,
    durationMs: null,
    statement: "",
    kind: null,
  });
  const [resultMode, setResultMode] = useState<ResultMode>("table");

  const runRefresh = useCallback(async () => {
    let nextTablesState: QuerySectionState<TableInfoRow>;

    try {
      const tables = store.query({
        query: `
          SELECT name, type, sql
          FROM sqlite_master
          WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
          ORDER BY name ASC
        `,
        bindValues: {},
      }) as TableInfoRow[];

      nextTablesState = {
        rows: sortTables(tables),
        updatedAt: Date.now(),
        error: null,
      };
    } catch (error) {
      nextTablesState = {
        rows: [],
        updatedAt: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      };
    }

    setTablesState(nextTablesState);

    const tables = nextTablesState.rows as unknown as TableInfoRow[];
    const nextSelectedTable =
      selectedTable && tables.some((table) => table.name === selectedTable)
        ? selectedTable
        : (tables.find((table) => !table.name.startsWith("__livestore"))
            ?.name ??
          tables[0]?.name ??
          "");

    if (nextSelectedTable !== selectedTable) {
      setSelectedTable(nextSelectedTable);
    }

    if (!nextSelectedTable) {
      setColumnsState({
        rows: [],
        updatedAt: Date.now(),
        error: nextTablesState.error,
      });
      setRowsState({
        rows: [],
        updatedAt: Date.now(),
        error: nextTablesState.error,
      });
      setOpfsSnapshot(await readOpfsSnapshot(storagePath));
      return;
    }

    try {
      const columns = store.query({
        query: `
          SELECT
            cid,
            name,
            type,
            "notnull" AS "notNull",
            dflt_value AS "defaultValue",
            pk
          FROM pragma_table_info(${escapeSqlString(nextSelectedTable)})
          ORDER BY cid ASC
        `,
        bindValues: {},
      }) as TableColumnRow[];

      setColumnsState({
        rows: columns,
        updatedAt: Date.now(),
        error: null,
      });
    } catch (error) {
      setColumnsState({
        rows: [],
        updatedAt: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      const rows = store.query({
        query: `SELECT * FROM ${quoteIdentifier(nextSelectedTable)} LIMIT ${maxRows}`,
        bindValues: {},
      }) as QueryRow[];

      setRowsState({
        rows,
        updatedAt: Date.now(),
        error: null,
      });
    } catch (error) {
      setRowsState({
        rows: [],
        updatedAt: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      });
    }

    setOpfsSnapshot(await readOpfsSnapshot(storagePath));
  }, [maxRows, selectedTable, storagePath, store]);

  useEffect(() => {
    void runRefresh();
    const intervalId = window.setInterval(() => {
      void runRefresh();
    }, pollIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [pollIntervalMs, runRefresh]);

  const runSql = useCallback(async () => {
    const statement = sqlInput.trim().replace(/;+$/, "");
    if (!statement) {
      setSqlResult({
        rows: [],
        error: "Enter a SQL statement to run.",
        updatedAt: Date.now(),
        durationMs: null,
        statement: "",
        kind: null,
      });
      setResultMode("sql");
      return;
    }

    try {
      const startedAt = performance.now();

      if (isReadStatement(statement)) {
        const rows = store.query({
          query: statement,
          bindValues: {},
        }) as QueryRow[];
        const durationMs = performance.now() - startedAt;

        setSqlResult({
          rows,
          error: null,
          updatedAt: Date.now(),
          durationMs,
          statement,
          kind: "read",
        });
      } else {
        const internalStore = store as unknown as {
          sqliteDbWrapper?: {
            execute: (
              query: string,
              bindValues?: Record<string, unknown>,
            ) => { durationMs: number };
          };
        };

        const execution = internalStore.sqliteDbWrapper?.execute(statement, {});
        if (!execution) {
          throw new Error(
            "Write queries are unavailable because the sqlite executor is not exposed.",
          );
        }

        setSqlResult({
          rows: [],
          error: null,
          updatedAt: Date.now(),
          durationMs: execution.durationMs,
          statement,
          kind: "write",
        });

        await runRefresh();
      }

      setResultMode("sql");
    } catch (error) {
      setSqlResult({
        rows: [],
        error: error instanceof Error ? error.message : String(error),
        updatedAt: Date.now(),
        durationMs: null,
        statement,
        kind: null,
      });
      setResultMode("sql");
    }
  }, [runRefresh, sqlInput, store]);

  const tables = useMemo(() => {
    return tablesState.rows as unknown as TableInfoRow[];
  }, [tablesState.rows]);

  const filteredTables = useMemo(() => {
    const query = tableFilter.trim().toLowerCase();
    if (!query) {
      return tables;
    }

    return tables.filter((table) => table.name.toLowerCase().includes(query));
  }, [tableFilter, tables]);

  const selectedTableInfo = useMemo(() => {
    return tables.find((table) => table.name === selectedTable) ?? null;
  }, [selectedTable, tables]);

  const columns = useMemo(() => {
    return columnsState.rows as unknown as TableColumnRow[];
  }, [columnsState.rows]);

  const schemaRows = useMemo<QueryRow[]>(() => {
    return columns.map((column) => ({
      cid: column.cid,
      name: column.name,
      type: column.type || "untyped",
      notNull: column.notNull ? "yes" : "no",
      pk: column.pk ? "yes" : "no",
      defaultValue: formatCellValue(column.defaultValue),
    }));
  }, [columns]);

  const commitTableEdit = useCallback(
    async (rowIndex: number, columnName: string, draftValue: string) => {
      if (resultMode !== "table") {
        throw new Error("Only table preview rows can be edited.");
      }

      if (!selectedTableInfo) {
        throw new Error("No table selected.");
      }

      const targetRow = rowsState.rows[rowIndex];
      if (!targetRow) {
        throw new Error("Row no longer exists.");
      }

      const targetColumn = columns.find((column) => column.name === columnName);
      if (!targetColumn) {
        throw new Error(`Column ${columnName} is unavailable.`);
      }

      const primaryKeyColumns = columns.filter((column) => column.pk);
      if (primaryKeyColumns.length === 0) {
        throw new Error("Editing requires a primary key.");
      }

      let nextValue: unknown = draftValue;
      const normalizedType = targetColumn.type.trim().toUpperCase();
      if (draftValue === "" && targetColumn.notNull === 0) {
        nextValue = null;
      } else if (
        draftValue.toLowerCase() === "null" &&
        targetColumn.notNull === 0
      ) {
        nextValue = null;
      } else if (normalizedType.includes("INT")) {
        const parsed = Number(draftValue);
        if (!Number.isFinite(parsed)) {
          throw new Error(`Column ${columnName} expects a numeric value.`);
        }
        nextValue = parsed;
      }

      const setClause = `${quoteIdentifier(columnName)} = ${sqlLiteral(nextValue)}`;
      const whereClause = primaryKeyColumns
        .map(
          (column) =>
            `${quoteIdentifier(column.name)} = ${sqlLiteral(targetRow[column.name])}`,
        )
        .join(" AND ");

      const internalStore = store as unknown as {
        sqliteDbWrapper?: {
          execute: (
            query: string,
            bindValues?: Record<string, unknown>,
          ) => { durationMs: number };
        };
      };
      const execution = internalStore.sqliteDbWrapper?.execute(
        `UPDATE ${quoteIdentifier(selectedTableInfo.name)} SET ${setClause} WHERE ${whereClause}`,
        {},
      );

      if (!execution) {
        throw new Error(
          "Editing is unavailable because the sqlite executor is not exposed.",
        );
      }

      await runRefresh();
    },
    [columns, resultMode, rowsState.rows, runRefresh, selectedTableInfo, store],
  );

  const activeRows = resultMode === "sql" ? sqlResult.rows : rowsState.rows;
  const activeFallbackColumns =
    resultMode === "sql" ? [] : columns.map((column) => column.name);
  const activeSubtitle =
    resultMode === "sql"
      ? (sqlResult.error ??
        (sqlResult.kind === "write"
          ? "Statement executed successfully."
          : `${sqlResult.rows.length} row${sqlResult.rows.length === 1 ? "" : "s"} returned`))
      : (rowsState.error ??
        `${rowsState.rows.length} preview row${rowsState.rows.length === 1 ? "" : "s"}`);

  const sqlStatusText =
    resultMode === "sql"
      ? (sqlResult.error ??
        (sqlResult.kind === "write"
          ? "Statement executed."
          : `${sqlResult.rows.length} row${sqlResult.rows.length === 1 ? "" : "s"} returned`))
      : `Previewing ${selectedTableInfo?.name ?? "table"}`;

  const selectedSummaryRows: Array<[string, ReactNode]> = [
    ["Table", selectedTableInfo?.name ?? "None"],
    ["Type", selectedTableInfo?.type ?? "table"],
    ["Columns", columns.length],
    ["Rows loaded", rowsState.rows.length],
    [
      "Storage",
      opfsSnapshot.exists ? formatBytes(opfsSnapshot.totalBytes) : "Missing",
    ],
    [
      "Updated",
      formatTimestamp(
        sqlResult.updatedAt ?? rowsState.updatedAt ?? tablesState.updatedAt,
      ),
    ],
  ];

  return (
    <div
      className="flex h-dvh min-h-0 flex-col overflow-hidden"
      style={{ backgroundColor: APP_BG, color: TEXT }}
    >
      <header
        className="flex shrink-0 items-center justify-between gap-4 border-b px-3 py-2"
        style={{ borderBottomColor: BORDER, backgroundColor: SURFACE }}
      >
        <div className="min-w-0 flex items-center gap-3">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-sm border bg-[#e8f0ff] text-xs font-semibold"
            style={{ borderColor: "#bfd0ef", color: ACCENT }}
          >
            DB
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold">
              {selectedTableInfo?.name ?? "Local database workbench"}
            </div>
            <div className="truncate text-[11px]" style={{ color: TEXT_MUTED }}>
              {title} · {tables.length} tables ·{" "}
              {currentPath ? `source ${currentPath} · ` : ""}
              {storagePath}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <ShellButton
            onClick={() => {
              setResultMode("table");
            }}
          >
            Data
          </ShellButton>
          <ShellButton
            onClick={() => {
              void runRefresh();
            }}
          >
            Refresh
          </ShellButton>
          <ShellButton
            tone="primary"
            onClick={() => {
              void runSql();
            }}
          >
            Execute
          </ShellButton>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0">
          <aside
            className="shrink-0 border-r"
            style={{
              width: SIDEBAR_WIDTH,
              minWidth: SIDEBAR_WIDTH,
              borderRightColor: BORDER,
              backgroundColor: SURFACE,
            }}
          >
            <div className="flex h-full min-h-0 flex-col">
              <PaneSection
                title="Objects"
                extra={<span>{filteredTables.length}</span>}
              >
                <div className="space-y-2 px-3 py-2">
                  <input
                    value={tableFilter}
                    onChange={(event) => setTableFilter(event.target.value)}
                    placeholder="Filter tables"
                    className="w-full rounded-sm border px-2.5 py-1.5 text-[11px] outline-none"
                    style={{
                      borderColor: BORDER_STRONG,
                      backgroundColor: SURFACE_SUBTLE,
                      color: TEXT,
                    }}
                  />
                  <div className="max-h-[calc(100dvh-220px)] space-y-0.5 overflow-auto">
                    {filteredTables.length > 0 ? (
                      filteredTables.map((table) => {
                        const isSelected = table.name === selectedTable;
                        return (
                          <button
                            key={table.name}
                            type="button"
                            onClick={() => {
                              setSelectedTable(table.name);
                              setResultMode("table");
                            }}
                            className="w-full border px-2.5 py-1.5 text-left transition"
                            style={{
                              borderColor: isSelected ? ACCENT : BORDER,
                              backgroundColor: isSelected
                                ? ACCENT_SOFT
                                : SURFACE,
                            }}
                          >
                            <div
                              className="truncate font-mono text-[12px]"
                              style={{ color: TEXT }}
                            >
                              {table.name}
                            </div>
                            <div
                              className="mt-1 text-[11px]"
                              style={{ color: TEXT_MUTED }}
                            >
                              {table.type}
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="text-xs" style={{ color: TEXT_MUTED }}>
                        {tablesState.error ??
                          "No tables matched the current filter."}
                      </div>
                    )}
                  </div>
                </div>
              </PaneSection>
              <PaneSection
                title="Storage"
                extra={
                  <span>
                    {opfsSnapshot.exists
                      ? formatBytes(opfsSnapshot.totalBytes)
                      : "0 B"}
                  </span>
                }
              >
                <div className="max-h-60 space-y-1 overflow-auto px-3 py-2">
                  {opfsSnapshot.error ? (
                    <div className="text-[11px]" style={{ color: DANGER }}>
                      {opfsSnapshot.error}
                    </div>
                  ) : opfsSnapshot.tree.length > 0 ? (
                    opfsSnapshot.tree.map((node) => (
                      <TreeNodeView key={node.path} node={node} depth={0} />
                    ))
                  ) : (
                    <div className="text-[11px]" style={{ color: TEXT_MUTED }}>
                      No OPFS entries found under this storage path.
                    </div>
                  )}
                </div>
              </PaneSection>
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <div className="flex h-full min-h-0">
              <div className="min-w-0 flex-1">
                <div className="flex h-full min-h-0 flex-col">
                  <div
                    className="flex shrink-0 items-center justify-between gap-3 px-3 py-2"
                    style={{
                      backgroundColor: SURFACE,
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="truncate text-[13px] font-medium">
                        {resultMode === "sql"
                          ? "Query Results"
                          : (selectedTableInfo?.name ?? "Table Data")}
                      </div>
                      <div
                        className="text-[11px]"
                        style={{ color: TEXT_MUTED }}
                      >
                        {activeSubtitle}
                      </div>
                    </div>
                    <div className="text-[11px]" style={{ color: TEXT_SOFT }}>
                      {resultMode === "sql" && sqlResult.durationMs !== null
                        ? `${sqlResult.durationMs.toFixed(2)} ms`
                        : `${maxRows} row preview`}
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-hidden bg-white border-none">
                    <div className="flex h-full min-h-0 flex-col">
                      {resultMode === "sql" && sqlResult.statement ? (
                        <div
                          className="px-2.5 py-1.5 font-mono text-[11px]"
                          style={{
                            backgroundColor: SURFACE_SUBTLE,
                            color: TEXT_MUTED,
                          }}
                        >
                          {sqlResult.statement}
                        </div>
                      ) : null}
                      {resultMode === "sql" && sqlResult.error ? (
                        <div
                          className="border px-2.5 py-1.5 text-[11px]"
                          style={{
                            borderColor: "#fecaca",
                            backgroundColor: "#fef2f2",
                            color: DANGER,
                          }}
                        >
                          {sqlResult.error}
                        </div>
                      ) : null}
                      {resultMode === "sql" &&
                      sqlResult.kind === "write" &&
                      !sqlResult.error ? (
                        <div
                          className="border px-2.5 py-1.5 text-[11px]"
                          style={{
                            borderColor: "#bbf7d0",
                            backgroundColor: "#f0fdf4",
                            color: SUCCESS,
                          }}
                        >
                          Statement executed. Table metadata and preview were
                          refreshed.
                        </div>
                      ) : null}
                      <DataTable
                        rows={activeRows}
                        fallbackColumns={activeFallbackColumns}
                        editable={resultMode === "table"}
                        onCommitEdit={commitTableEdit}
                        fillHeight
                        emptyMessage={
                          resultMode === "sql"
                            ? (sqlResult.error ??
                              "Run a SQL statement to inspect the result set.")
                            : (rowsState.error ??
                              "No rows returned from the selected table.")
                        }
                      />
                    </div>
                  </div>
                  <div
                    className="shrink-0 border-t"
                    style={{ borderTopColor: BORDER, backgroundColor: SURFACE }}
                  >
                    <div
                      className="flex items-center gap-2 border-b px-3 py-1.5 text-[11px]"
                      style={{ borderBottomColor: BORDER, color: TEXT_MUTED }}
                    >
                      <span className="font-medium" style={{ color: TEXT }}>
                        SQL
                      </span>
                      <span>{sqlStatusText}</span>
                      {sqlResult.durationMs !== null ? (
                        <span>· {sqlResult.durationMs.toFixed(2)} ms</span>
                      ) : null}
                      <span style={{ color: WARNING }}>
                        · write statements allowed
                      </span>
                    </div>
                    <div className="space-y-2 px-3 py-2">
                      <textarea
                        value={sqlInput}
                        onChange={(event) => setSqlInput(event.target.value)}
                        spellCheck={false}
                        placeholder={`SELECT * FROM ${selectedTableInfo ? quoteIdentifier(selectedTableInfo.name) : "sqlite_master"} LIMIT ${maxRows};`}
                        className="min-h-28 w-full resize-y border px-2.5 py-2 font-mono text-[11px] outline-none"
                        style={{
                          borderColor: BORDER_STRONG,
                          backgroundColor: SURFACE_SUBTLE,
                          color: TEXT,
                        }}
                      />
                      <div className="flex items-center justify-between gap-3">
                        <div
                          className="text-[11px]"
                          style={{ color: TEXT_MUTED }}
                        >
                          Use SELECT, PRAGMA, INSERT, UPDATE, DELETE, or DDL
                          statements.
                        </div>
                        <div className="flex items-center gap-2">
                          <ShellButton
                            onClick={() => {
                              if (selectedTableInfo) {
                                setSqlInput(
                                  `SELECT * FROM ${quoteIdentifier(selectedTableInfo.name)} LIMIT ${maxRows};`,
                                );
                              }
                            }}
                          >
                            Load Preview SQL
                          </ShellButton>
                          <ShellButton
                            tone="primary"
                            onClick={() => {
                              void runSql();
                            }}
                          >
                            Execute
                          </ShellButton>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <aside
                className="shrink-0 border-solid"
                style={{
                  width: DETAILS_WIDTH,
                  minWidth: DETAILS_WIDTH,
                  borderLeftColor: BORDER,
                  backgroundColor: SURFACE,
                  borderLeftWidth: 1,
                }}
              >
                <div className="flex h-full min-h-0 flex-col overflow-auto">
                  <PaneSection title="Properties">
                    <div className="space-y-0 px-3 py-2">
                      {selectedSummaryRows.map(([label, value]) => (
                        <div
                          key={label}
                          className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 border-b py-1 text-[11px]"
                          style={{ borderBottomColor: BORDER }}
                        >
                          <div style={{ color: TEXT_SOFT }}>{label}</div>
                          <div
                            className="min-w-0 truncate font-medium"
                            style={{ color: TEXT }}
                          >
                            {value}
                          </div>
                        </div>
                      ))}
                    </div>
                  </PaneSection>

                  <PaneSection
                    title="Schema"
                    extra={<span>{columns.length}</span>}
                  >
                    <DataTable
                      rows={schemaRows}
                      fallbackColumns={[
                        "cid",
                        "name",
                        "type",
                        "notNull",
                        "pk",
                        "defaultValue",
                      ]}
                      emptyMessage={
                        columnsState.error ?? "No schema metadata available."
                      }
                    />
                  </PaneSection>

                  <PaneSection title="Definition">
                    <pre
                      className="overflow-auto border px-2.5 py-2 font-mono text-[11px]"
                      style={{
                        borderColor: BORDER,
                        backgroundColor: SURFACE_SUBTLE,
                        color: TEXT_MUTED,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {selectedTableInfo?.sql?.trim() ||
                        "No CREATE SQL available for the selected table."}
                    </pre>
                  </PaneSection>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
