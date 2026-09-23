import { useCallback, useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";

import { Popover } from "@base-ui/react/popover";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNodeByKey, $getSelection, $isNodeSelection, type NodeKey } from "lexical";

import { $isMathNode } from "@/components/editor/lexical/MathNode";
import { tokens } from "../../styles/stylex.stylex";

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

const styles = stylex.create({
  popup: {
    backgroundColor: "var(--color-memora-surface)",
    border: "1px solid var(--color-memora-border)",
    borderRadius: 12,
    boxShadow: tokens.shadowLarge,
    outline: "none",
    padding: 12,
    width: "min(26rem, calc(100vw - 1.5rem))",
  },
  arrow: { fill: "var(--color-memora-surface)", stroke: "var(--color-memora-border)" },
  title: { color: "var(--color-memora-text-strong)", fontSize: 14, fontWeight: 600 },
  description: { color: "var(--color-memora-text-soft)", fontSize: 12, marginTop: 2 },
  field: {
    backgroundColor: "var(--color-memora-surface-soft)",
    border: "1px solid var(--color-memora-border)",
    borderRadius: 8,
    color: "var(--color-memora-text)",
    fontFamily: "monospace",
    fontSize: 14,
    lineHeight: "24px",
    marginTop: 12,
    outline: "none",
    paddingBlock: 8,
    paddingInline: 12,
    transition: "color 150ms, background-color 150ms",
    width: "100%",
    "::placeholder": { color: "var(--color-memora-text-soft)" },
    ":focus": {
      borderColor: "var(--color-memora-olive-soft)",
      boxShadow: "0 0 0 2px color-mix(in srgb, var(--color-memora-olive-soft) 45%, transparent)",
    },
  },
  multiline: { minHeight: 96, resize: "vertical" },
});

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
            {...stylex.props(styles.popup)}
            finalFocus={false}
            initialFocus={fieldRef}
          >
            <Popover.Arrow className={stylex.props(styles.arrow).className} />
            <Popover.Title className={stylex.props(styles.title).className}>
              Edit formula
            </Popover.Title>
            <Popover.Description className={stylex.props(styles.description).className}>
              {selectedFormula?.displayMode ? "Block formula" : "Inline formula"} · updates
              automatically
            </Popover.Description>
            {selectedFormula?.displayMode ? (
              <textarea
                aria-label="LaTeX"
                className={stylex.props(styles.field, styles.multiline).className}
                onChange={(event) => handleDraftChange(event.target.value)}
                ref={(element) => {
                  fieldRef.current = element;
                }}
                value={draft}
              />
            ) : (
              <input
                aria-label="LaTeX"
                className={stylex.props(styles.field).className}
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
