# Formula Editor Popover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Base UI Popover that edits selected inline and block LaTeX formulas with a 300 ms debounced live update.

**Architecture:** A focused `MathEditorPopover` Lexical plugin observes `NodeSelection`, anchors Base UI's `Popover.Positioner` to `editor.getElementByKey(nodeKey)`, and owns the draft/debounce lifecycle. `MathNode` exposes a writable formula setter; the existing `OnChangePlugin` remains the only Markdown export path.

**Tech Stack:** React 19, Lexical, Base UI React 1.0, KaTeX, Tailwind CSS v4, Vite+ Test.

## Global Constraints

- Use `Popover.Root`, `Popover.Portal`, `Popover.Positioner`, `Popover.Popup`, `Popover.Arrow`, `Popover.Title`, and `Popover.Description` from `@base-ui/react/popover`.
- Write the latest input to the selected formula after exactly 300 ms of inactivity.
- Flush a pending value before closing or switching formula nodes.
- Preserve the existing inline/block formula type; do not add conversion controls.
- Use a single-line input for inline math and a textarea for block math.
- Add no dependency and use existing Memora semantic color tokens.

---

### Task 1: Make MathNode formula content writable

**Files:**

- Modify: `packages/web/src/components/editor/lexical/MathNode.tsx`
- Test: `packages/web/test/editor/markdownTransformers.test.ts`

**Interfaces:**

- Produces: `MathNode.setFormula(formula: string): this`
- Preserves: `MathNode.getDisplayMode(): boolean`

- [ ] **Step 1: Add a failing node mutation test**

Add a test that creates an inline `MathNode`, calls `setFormula("a^2+b^2=c^2")` inside `editor.update`, and expects `exportWysiwygMarkdown` to contain `$$a^2+b^2=c^2$$` while `getDisplayMode()` stays `false`.

```ts
test("updates a formula without changing its display mode", () => {
  const editor = createEditor({
    nodes: [MathNode],
    onError: (error) => {
      throw error;
    },
  });

  editor.update(
    () => {
      const node = new MathNode("a+b", false);
      $getRoot().append($createParagraphNode().append(node));
      node.setFormula("a^2+b^2=c^2");
      expect(node.getDisplayMode()).toBe(false);
    },
    { discrete: true },
  );

  expect(exportWysiwygMarkdown(editor.getEditorState())).toContain("$$a^2+b^2=c^2$$");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd packages/web
./node_modules/.bin/vp test run test/editor/markdownTransformers.test.ts
```

Expected: TypeScript/runtime failure because `MathNode.setFormula` does not exist.

- [ ] **Step 3: Implement the writable setter**

```ts
setFormula(formula: string): this {
  if (this.getLatest().__formula === formula) {
    return this;
  }

  const self = this.getWritable();
  self.__formula = formula;
  return self;
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same Vite+ command. Expected: all `markdownTransformers` tests pass.

### Task 2: Build the controlled Base UI formula popover

**Files:**

- Create: `packages/web/src/components/editor/MathEditorPopover.tsx`
- Create: `packages/web/test/editor/MathEditorPopover.test.tsx`

**Interfaces:**

- Consumes: `MathNode.setFormula(formula: string): this`
- Produces: `MathEditorPopover(): JSX.Element | null`

- [ ] **Step 1: Add failing integration tests for inline and block formulas**

Render `WysiwygDocumentEditor`, click the KaTeX formula, and assert:

```ts
expect(await view.findByRole("dialog", { name: "Edit formula" })).not.toBeNull();
const input = view.getByRole("textbox", { name: "LaTeX" });
expect(input.tagName).toBe("INPUT");
expect(input).toHaveValue("E=mc^2");
```

Render `$$\\sum_{i=1}^n i$$` and assert the LaTeX field is a `TEXTAREA`, accepts a newline, and the popup contains the text `Block formula`.

- [ ] **Step 2: Add a failing fake-timer test for the 300 ms update**

```ts
vi.useFakeTimers();
fireEvent.change(input, { target: { value: "x^2+y^2" } });
await vi.advanceTimersByTimeAsync(299);
expect(onTextChange).not.toHaveBeenCalledWith(expect.stringContaining("x^2+y^2"));
await vi.advanceTimersByTimeAsync(1);
expect(onTextChange).toHaveBeenCalledWith(expect.stringContaining("x^2+y^2"));
```

Restore real timers in `afterEach`.

- [ ] **Step 3: Run the new test and verify RED**

Run:

```bash
cd packages/web
./node_modules/.bin/vp test run test/editor/MathEditorPopover.test.tsx
```

Expected: the formula popup and LaTeX field cannot be found.

- [ ] **Step 4: Implement selected-formula discovery and pending commits**

Use this state boundary in `MathEditorPopover.tsx`:

```ts
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

const commitFormula = (editor: LexicalEditor, pending: PendingFormulaCommit): void => {
  editor.update(() => {
    const node = $getNodeByKey(pending.nodeKey);
    if ($isMathNode(node)) {
      node.setFormula(pending.formula);
    }
  });
};
```

Register an update listener that reads a single selected `MathNode`, resolves `editor.getElementByKey(nodeKey)`, flushes the previous pending commit when the node key changes, and resets the draft only when a different formula becomes active.

- [ ] **Step 5: Implement the Base UI popup**

Render the controlled structure:

```tsx
<Popover.Root open={selectedFormula !== null} modal={false} onOpenChange={handleOpenChange}>
  <Popover.Portal>
    <Popover.Positioner
      anchor={selectedFormula?.anchor ?? null}
      align="center"
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
        <Popover.Arrow className="fill-[var(--color-memora-surface)]" />
        <Popover.Title className="text-sm font-semibold text-[var(--color-memora-text-strong)]">
          Edit formula
        </Popover.Title>
        <Popover.Description className="text-xs text-[var(--color-memora-text-soft)]">
          {selectedFormula?.displayMode ? "Block formula" : "Inline formula"} · updates
          automatically
        </Popover.Description>
        {selectedFormula?.displayMode ? (
          <textarea aria-label="LaTeX" value={draft} onChange={handleDraftChange} />
        ) : (
          <input aria-label="LaTeX" value={draft} onChange={handleDraftChange} />
        )}
      </Popover.Popup>
    </Popover.Positioner>
  </Popover.Portal>
</Popover.Root>
```

Use the same calm token-based input classes for both controls, set `font-mono`, and give the textarea `min-h-24 resize-y`.

- [ ] **Step 6: Verify inline/block and debounce tests are GREEN**

Run the new test file. Expected: both field variants and the 300 ms commit test pass.

### Task 3: Cover dismissal, switching, and editor integration

**Files:**

- Modify: `packages/web/src/components/editor/WysiwygDocumentEditor.tsx`
- Modify: `packages/web/test/editor/MathEditorPopover.test.tsx`
- Modify: `packages/web/test/editor/SourceDocumentEditor.test.tsx`

**Interfaces:**

- Consumes: `MathEditorPopover(): JSX.Element | null`
- Produces: formula editing in the mounted WYSIWYG editor

- [ ] **Step 1: Add failing tests for dismissal and formula switching**

Add tests that:

1. Change the field and press Escape before 300 ms; expect the latest value in exported Markdown and the dialog to close.
2. Change formula A and click formula B before 300 ms; expect formula A's latest value to be committed and formula B's current value to populate the field.
3. Edit a block and inline formula and verify each `MathNode.getDisplayMode()` value remains unchanged. Memora currently serializes both forms with `$$...$$` and distinguishes them by block placement.

- [ ] **Step 2: Run the new tests and verify RED**

Run the `MathEditorPopover` test file. Expected: pending drafts are lost or the popup is not mounted.

- [ ] **Step 3: Mount the plugin and finish close behavior**

Import and mount the plugin beside the formatting toolbar:

```tsx
<MarkdownShortcutPlugin transformers={WYSIWYG_TRANSFORMERS} />
<WysiwygFormattingToolbar />
<MathEditorPopover />
```

On `Popover.Root` close, synchronously flush the pending commit, then clear the selected formula from the Lexical `NodeSelection` so Escape does not reopen the controlled popup.

- [ ] **Step 4: Run formula and existing editor tests**

Run:

```bash
cd packages/web
./node_modules/.bin/vp test run test/editor/MathEditorPopover.test.tsx test/editor/SourceDocumentEditor.test.tsx test/editor/WysiwygFormattingToolbar.test.tsx test/editor/markdownTransformers.test.ts
```

Expected: all focused tests pass with no warnings.

- [ ] **Step 5: Run final verification**

Run:

```bash
cd packages/web
./node_modules/.bin/vp test run test/editor
cd ../..
NODE_OPTIONS=--experimental-strip-types ./node_modules/.bin/vp lint packages/web/src/components/editor/MathEditorPopover.tsx packages/web/src/components/editor/WysiwygDocumentEditor.tsx packages/web/src/components/editor/lexical/MathNode.tsx packages/web/test/editor/MathEditorPopover.test.tsx packages/web/test/editor/markdownTransformers.test.ts
./node_modules/.bin/vp fmt packages/web/src/components/editor/MathEditorPopover.tsx packages/web/src/components/editor/WysiwygDocumentEditor.tsx packages/web/src/components/editor/lexical/MathNode.tsx packages/web/test/editor/MathEditorPopover.test.tsx packages/web/test/editor/markdownTransformers.test.ts --check
```

Expected: the complete editor suite passes, lint reports zero errors and warnings, and formatting check passes.
