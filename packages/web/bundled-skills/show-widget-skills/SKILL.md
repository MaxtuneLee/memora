---
name: show-widget-skills
description: Use when the user wants inline diagrams, charts, mockups, artwork, or interactive widgets rendered inside chat via the show_widget tool.
---

# Show Widget Skills

Use this skill before calling `show_widget`.

## Workflow

1. Read `README.md` first in the current turn.
2. Read exactly one primary module guideline from `guidelines/`.
3. Read the required section files for that module from `sections/`.
4. Only then call `show_widget`.

## Required module sections

- `art`: `sections/svg_setup.md`, `sections/art_and_illustration.md`
- `mockup`: `sections/ui_components.md`, `sections/color_palette.md`
- `interactive`: `sections/ui_components.md`, `sections/color_palette.md`, `sections/svg_setup.md`
- `chart`: `sections/ui_components.md`, `sections/color_palette.md`, `sections/charts_chart_js.md`
- `diagram`: `sections/color_palette.md`, `sections/svg_setup.md`, `sections/diagram_types.md`

## Optional supplements

- If the request is art with clear interactivity, also read `guidelines/art_interactive.md`.
- If the request is a chart with clear interactivity, also read `guidelines/chart_interactive.md`.
- If the widget declares `data_files`/calls `writeData`, or binds `data_source: "widgetData"`, also read `sections/widget_data.md`.

## Tool contract

- `show_widget` is the only tool for emitting the rendered widget.
- Set `i_have_seen_read_me` to `true` only after reading `README.md` in the current turn.
- `widget_code` must stream in this order: `<style>...</style>`, then HTML, then `<script>...</script>`.
- The runtime defers script execution until the full script block is available.
- To make the widget data-backed, set `data_source` to a data source catalog entry name (and
  `data_source_params` for entries that take params) — see README.md's "Data source catalog" for
  the full list, payload shapes, and the `onData`/`getData` bindings that deliver the result.
- To let the widget persist its own state, set `data_files` to the file names it will write and
  call `writeData(name, content)` from `widget_code` — see README.md's "Persisting the widget's
  own data" and `sections/widget_data.md` for the `onData` timing rules.
