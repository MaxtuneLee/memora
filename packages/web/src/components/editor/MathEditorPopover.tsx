import { useCallback, useEffect, useRef, useState } from "react";

import { Popover } from "@base-ui/react/popover";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNodeByKey, $getSelection, $isNodeSelection, type NodeKey } from "lexical";

import { $isMathNode } from "@/components/editor/lexical/MathNode";

interface SelectedFormula {
  anchor: HTMLElement;
  displayMode: boolean;
  formula: string;
  nodeKey: NodeKey;
}

interface PendingFormulaCommit {
  formula: string;
  nodeKey: NodeKey;
}

const FORMULA_UPDATE_DELAY_MS = 300;

const fieldClassName =
  "mt-3 w-full rounded-lg border border-[var(--color-memora-border)] bg-[var(--color-memora-surface-soft)] px-3 py-2 font-mono text-sm leading-6 text-[var(--color-memora-text)] outline-none transition-colors placeholder:text-[var(--color-memora-text-soft)] focus:border-[var(--color-memora-olive-soft)] focus:ring-2 focus:ring-[var(--color-memora-olive-soft)]/35";

export function MathEditorPopover() {
  const [editor] = useLexicalComposerContext();
  const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const pendingCommitRef = useRef<PendingFormulaCommit | null>(null);
  const selectedNodeKeyRef = useRef<NodeKey | null>(null);
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedFormula, setSelectedFormula] = useState<SelectedFormula | null>(null);
  const [draft, setDraft] = useState("");
  const selectedNodeKey = selectedFormula?.nodeKey ?? null;

  const commitFormula = useCallback(
    (pendingCommit: PendingFormulaCommit): void => {
      editor.update(
        () => {
          const node = $getNodeByKey(pendingCommit.nodeKey);
          if ($isMathNode(node)) {
            node.setFormula(pendingCommit.formula);
          }
        },
        { discrete: true },
      );
    },
    [editor],
  );

  const flushPendingFormulaCommit = useCallback((): void => {
    if (updateTimerRef.current !== null) {
      clearTimeout(updateTimerRef.current);
      updateTimerRef.current = null;
    }

    const pendingCommit = pendingCommitRef.current;
    pendingCommitRef.current = null;
    if (pendingCommit) {
      commitFormula(pendingCommit);
    }
  }, [commitFormula]);

  const scheduleFormulaCommit = useCallback(
    (formula: string, nodeKey: NodeKey): void => {
      if (updateTimerRef.current !== null) {
        clearTimeout(updateTimerRef.current);
      }
      pendingCommitRef.current = { formula, nodeKey };
      updateTimerRef.current = setTimeout(() => {
        const pendingCommit = pendingCommitRef.current;
        pendingCommitRef.current = null;
        updateTimerRef.current = null;
        if (pendingCommit) {
          commitFormula(pendingCommit);
        }
      }, FORMULA_UPDATE_DELAY_MS);
    },
    [commitFormula],
  );

  const handleDraftChange = useCallback(
    (formula: string): void => {
      setDraft(formula);
      if (selectedFormula) {
        scheduleFormulaCommit(formula, selectedFormula.nodeKey);
      }
    },
    [scheduleFormulaCommit, selectedFormula],
  );

  const readSelectedFormula = useCallback((): void => {
    const nextFormula = editor.getEditorState().read<Omit<SelectedFormula, "anchor"> | null>(() => {
      const selection = $getSelection();
      if (!$isNodeSelection(selection)) {
        return null;
      }

      const selectedNodes = selection.getNodes();
      if (selectedNodes.length !== 1 || !$isMathNode(selectedNodes[0])) {
        return null;
      }
      const mathNode = selectedNodes[0];

      return {
        displayMode: mathNode.getDisplayMode(),
        formula: mathNode.getFormula(),
        nodeKey: mathNode.getKey(),
      };
    });

    if (!nextFormula) {
      if (selectedNodeKeyRef.current !== null) {
        flushPendingFormulaCommit();
        selectedNodeKeyRef.current = null;
      }
      setSelectedFormula(null);
      return;
    }

    const anchor = editor.getElementByKey(nextFormula.nodeKey);
    if (!(anchor instanceof HTMLElement)) {
      flushPendingFormulaCommit();
      selectedNodeKeyRef.current = null;
      setSelectedFormula(null);
      return;
    }

    if (selectedNodeKeyRef.current !== nextFormula.nodeKey) {
      flushPendingFormulaCommit();
      selectedNodeKeyRef.current = nextFormula.nodeKey;
      setDraft(nextFormula.formula);
    }
    setSelectedFormula({ ...nextFormula, anchor });
  }, [editor, flushPendingFormulaCommit]);

  useEffect(() => {
    readSelectedFormula();
    const unregisterUpdateListener = editor.registerUpdateListener(readSelectedFormula);

    return () => {
      unregisterUpdateListener();
      flushPendingFormulaCommit();
    };
  }, [editor, flushPendingFormulaCommit, readSelectedFormula]);

  useEffect(() => {
    if (selectedNodeKey !== null) {
      fieldRef.current?.select();
    }
  }, [selectedNodeKey]);

  const closePopover = useCallback((): void => {
    flushPendingFormulaCommit();
    selectedNodeKeyRef.current = null;
    setSelectedFormula(null);
    editor.update(
      () => {
        const selection = $getSelection();
        if ($isNodeSelection(selection)) {
          selection.clear();
        }
      },
      { discrete: true },
    );
  }, [editor, flushPendingFormulaCommit]);

  return (
    <Popover.Root
      modal={false}
      onOpenChange={(open) => {
        if (!open) {
          closePopover();
        }
      }}
      open={selectedFormula !== null}
    >
      <Popover.Portal>
        <Popover.Positioner
          align="center"
          anchor={selectedFormula?.anchor ?? null}
          collisionPadding={12}
          side="top"
          sideOffset={8}
        >
          <Popover.Popup
            aria-label="Edit formula"
            className="w-[min(26rem,calc(100vw-1.5rem))] rounded-xl border border-[var(--color-memora-border)] bg-[var(--color-memora-surface)] p-3 shadow-[0_16px_40px_-24px_rgba(34,33,29,0.4)] outline-none"
            finalFocus={false}
            initialFocus={fieldRef}
          >
            <Popover.Arrow className="fill-[var(--color-memora-surface)] stroke-[var(--color-memora-border)]" />
            <Popover.Title className="text-sm font-semibold text-[var(--color-memora-text-strong)]">
              Edit formula
            </Popover.Title>
            <Popover.Description className="mt-0.5 text-xs text-[var(--color-memora-text-soft)]">
              {selectedFormula?.displayMode ? "Block formula" : "Inline formula"} · updates
              automatically
            </Popover.Description>
            {selectedFormula?.displayMode ? (
              <textarea
                aria-label="LaTeX"
                className={`${fieldClassName} min-h-24 resize-y`}
                onChange={(event) => handleDraftChange(event.target.value)}
                ref={(element) => {
                  fieldRef.current = element;
                }}
                value={draft}
              />
            ) : (
              <input
                aria-label="LaTeX"
                className={fieldClassName}
                onChange={(event) => handleDraftChange(event.target.value)}
                ref={(element) => {
                  fieldRef.current = element;
                }}
                type="text"
                value={draft}
              />
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
