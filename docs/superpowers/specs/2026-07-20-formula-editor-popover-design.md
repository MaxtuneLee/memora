# Formula Editor Popover Design

## Goal

Let users edit an existing inline or block formula directly from the WYSIWYG editor by clicking or selecting the rendered formula. The editor appears in a Base UI Popover and writes LaTeX changes back after a 300 ms debounce.

## Interaction

- A Lexical `NodeSelection` containing one `MathNode` opens the formula editor.
- Clicking a rendered formula continues to create that node selection and therefore opens the same editor.
- Inline formulas use a single-line input. Block formulas use a multiline textarea.
- The current inline/block type is preserved. The popover does not provide a type conversion control.
- The input receives focus when the popover opens and selects its existing contents.
- Input changes are written back to the selected `MathNode` after 300 ms without additional confirmation.
- Closing, pressing Escape, or selecting another formula flushes an outstanding debounced value immediately.
- Selecting non-formula content closes the popover. Selecting another formula reuses the popover with that formula's value and anchor.
- Empty or temporarily invalid input remains editable and cannot crash rendering. KaTeX continues to render with `throwOnError: false`.

## Architecture

Create a focused `MathEditorPopover` Lexical plugin next to the existing formatting toolbar. It observes editor updates and `SELECTION_CHANGE_COMMAND`, resolves the selected `MathNode`, and obtains its rendered element through `editor.getElementByKey(nodeKey)`.

The plugin renders a controlled Base UI Popover using `Popover.Root`, `Popover.Portal`, `Popover.Positioner`, `Popover.Popup`, `Popover.Arrow`, `Popover.Title`, and `Popover.Description`. `Popover.Positioner.anchor` points directly to the selected formula element, so no artificial `Popover.Trigger` is needed. The popover is non-modal and uses Base UI collision handling.

`MathNode` gains `setFormula(formula: string)`, implemented with `getWritable()`. Debounced commits call `editor.update()` and resolve the node again by key before mutating it, preventing stale node instances from being changed. The existing `OnChangePlugin` then exports Markdown and invokes the normal persistence flow.

## Visual Direction

The popover should feel like a quiet editor instrument: warm Memora surface, fine border, restrained shadow, clear LaTeX label, monospace input, and an understated inline/block status. It must use existing semantic color tokens and provide equivalent light/dark behavior through those tokens.

## Accessibility and Keyboard Behavior

- The popup is labelled “Edit formula”.
- The field is labelled “LaTeX”.
- Base UI manages popup semantics, outside press, focus entry, and Escape dismissal.
- `initialFocus` targets the input or textarea; `finalFocus={false}` avoids restoring focus to a missing trigger.
- The multiline textarea accepts Enter as content. The single-line input cannot introduce line breaks.
- Focus states use `--color-memora-olive-soft` and meet the existing editor control pattern.

## Testing

- Verify `MathNode.setFormula()` updates serialization and rendered content.
- Verify clicking an inline formula opens a single-line LaTeX field.
- Verify selecting a block formula opens a textarea with the current LaTeX.
- Use fake timers to verify no write occurs before 300 ms and the write occurs at 300 ms.
- Verify switching formulas flushes the previous draft and updates the field and anchor.
- Verify Escape or outside dismissal flushes the latest draft and closes the popup.
- Verify edits preserve the node's inline/block type and exported Markdown form.

## Scope

This change edits existing formulas only. It does not add formula insertion, inline/block conversion, LaTeX autocomplete, a symbol palette, or a separate rendered preview inside the popover.
