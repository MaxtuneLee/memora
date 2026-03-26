# Transcript Workbench Redesign

## Summary

Redesign the transcript surface so it feels like part of Memora's upgraded product UI instead of a leftover white-card page. The primary target is `/transcript`, which should become a restrained transcript workbench: calm, warm, and clearly tool-oriented. The page must inherit the dashboard's material system and editorial discipline without turning into a hero page or a decorative marketing surface.

The redesign also includes light visual alignment work for `/transcript/live` and `/transcript/file/:id`, but those pages keep their existing interaction models and information architecture. The goal is continuity, not a full module rewrite.

Design direction in one sentence: make transcript feel like a proper working tool inside Memora's premium shell, with one dominant surface, quiet controls, and subtle motion.

## Goals

- Bring `/transcript` into the same visual family as the upgraded dashboard.
- Replace the current card-wall homepage with a transcript-specific workbench layout.
- Make the page feel more like a mature productivity tool and less like a generic showcase.
- Keep the page focused on two jobs: start a new live transcript and continue working from transcript history.
- Introduce subtle motion that supports hierarchy and continuity without adding decorative animation.
- Apply a small amount of visual unification to `/transcript/live` and `/transcript/file/:id`.

## Non-Goals

- No changes to recording, pause, finalize, save, or redirect logic on `/transcript/live`.
- No new transcript filters, sorting modes, bulk actions, or search features.
- No changes to transcript detail behaviors such as playback, seek, export, rename, manual transcript save, or diagnostics handling.
- No redesign of the transcript detail reading model or media player layout.
- No new data model, storage format, or routing changes.
- No new dependency additions for animation or layout.

## Scope

### Primary scope: `/transcript`

The transcript landing page is the main redesign target. It should stop borrowing the generic library-card presentation and instead use a transcript-specific workbench layout built for history browsing and quick continuation.

### Secondary scope: `/transcript/live`

The live page receives light visual alignment only:

- unify the page shell tone with the updated transcript landing page
- align the settings trigger and quiet controls with the newer dashboard language
- refine the surrounding surfaces so the sticky control rail feels like the same product family

The recording flow, motion timings, and state logic stay intact unless a visual adjustment requires a purely presentational class change.

### Secondary scope: `/transcript/file/:id`

The detail page receives light visual alignment only:

- align outer page shell and main surface tone where needed
- tighten header and surrounding surface language if it feels visually older than the new transcript landing page

The transcript content area, media controls, search/export behavior, and file actions stay functionally unchanged.

## User Experience

### `/transcript` page structure

The page becomes a restrained workbench with three vertical zones:

1. A compact title bar
2. A low-emphasis utility rail
3. A single dominant history workbench surface

The page should feel immediately useful on entry. The user should not need to visually step through multiple promotional or explanatory blocks before reaching their saved transcripts.

### Compact title bar

The title bar should contain:

- page title: `Transcripts`
- one short descriptive line
- primary action: `New live transcript`
- secondary utility: settings trigger

This area must stay compact. It should not become a hero banner, statement section, or branded editorial spread. The typography can be more refined than the current page, but the structure must remain tool-like.

### Utility rail

Below the title bar, include a quiet contextual rail for low-priority but useful status:

- current transcription language
- model readiness or related model state summary
- total transcript or recording count

This rail should read as supporting context, not as a grid of feature cards or KPI blocks. It may use muted pills, inline labels, or a thin inset strip, but it must not compete with the main workbench.

Implementation boundary for this rail:

- current language should come from the same existing transcript language source already used by the transcript pages
- record count may be computed directly from the recordings already fetched for the page; no new aggregate store or backend requirement should be introduced
- model status should only be shown if an existing transcript-page source can provide it without inventing a new global state dependency; if no suitable existing source is available on the landing page, the rail may omit model status entirely

### History workbench

The history area becomes one large primary surface containing the transcript list. This should replace the current `RecordingsGrid`-style card wall on the landing page.

The workbench should include:

- a small local section heading such as `Recent transcripts`
- an optional compact support line if needed
- a vertically stacked transcript history list

The workbench should be the clear focal region of the page. Avoid splitting the page into multiple equally large cards.

### Transcript history row

Each row should present transcript-centric information, not generic file-card information. A row should prioritize:

- file name
- transcript preview snippet, if available
- file type
- duration, when available
- `updatedAt` when present, otherwise `createdAt`
- transcript availability/status cue
- primary path into detail view
- row actions such as delete, without overwhelming the row

The row should support fast scanning. It should feel closer to a refined document or media work list than to a gallery of standalone cards.

### Status treatment

The landing page should express transcript usefulness quietly. It does not need a loud badge system.

Acceptable status cues include:

- transcript ready
- no transcript yet
- diagnostics present

Status should be represented through restrained text, tone, or a very small meta treatment. It should not turn every row into a multi-badge dashboard.

### Empty state

If there are no recordings, the page should still feel intentional and usable.

The empty state should:

- live inside the same main workbench surface
- explain in one short sentence what the page is for
- offer a direct path to start a live transcript

It must remain calm and product-like. No illustration, oversized icon treatment, or onboarding-marketing block is needed.

### Responsive behavior

On narrow screens:

- the title bar can stack, but the primary action should remain easy to reach
- the utility rail can wrap into multiple lines
- transcript rows can collapse into a 2-block layout rather than a dense multi-column layout
- the workbench must still read as one continuous primary surface

The mobile layout should reduce density, not amputate functionality.

## Visual System

### Material direction

Use the existing Memora warm shell and surface hierarchy:

- page shell in `--color-memora-shell` or `--color-memora-canvas`
- dominant surface in `--color-memora-surface`
- soft borders from the existing Memora border tokens
- minimal shadows only where needed to keep the main workbench distinct

Do not revert to stark white cards on a neutral gray background. Do not introduce decorative gradients or showcase sections.

### Typography

Typography should stay disciplined:

- the page title may use serif for a restrained high-emphasis moment
- utility text, row text, controls, and metadata should use sans serif
- row hierarchy should come from spacing, weight, and alignment rather than decorative labels

The page should feel refined but still operational.

### Control language

Controls must align with the newer dashboard language:

- primary CTA uses the dark compact button treatment
- settings and other utilities use low-chrome menu triggers
- hover and focus states remain soft and quiet

Controls should feel integrated into the workspace, not promotional.

### Density and composition

The page should use one dominant surface plus a small amount of supporting inset styling. Avoid card-in-card accumulation.

Specifically:

- no large decorative top panel
- no trio of summary cards
- no visual motif that exists only to add personality
- no dense analytics styling

The result should feel like a proper transcript tool, not an art-directed landing page.

## Motion

Motion is required, but it must be faint and structural.

### Motion goals

- make the page feel polished and current
- soften state changes and content entrance
- reinforce hierarchy without drawing attention to animation itself

### Allowed motion

- page sections may fade in with a slight upward translate
- list rows may use a very small hover tone shift
- menu triggers and buttons may use subtle background and border transitions
- empty-state and list-state transitions may use soft opacity changes

### Motion constraints

- no bounce, springy spectacle, or large scale effects
- no decorative shimmer, pulse, or floating UI
- no motion that turns the workbench into a showcase
- respect reduced-motion preferences

The right benchmark is "noticeable only when paying attention."

## Component Structure

Implementation planning should assume the existing transcript landing page will stop using the generic recordings grid as its main content presentation.

Expected structural direction:

- keep `TranscriptPage.tsx` as the route entry component
- introduce transcript-specific landing-page components for the workbench list and row presentation
- reuse existing data hooks and existing navigation/delete behavior

Likely component boundaries:

- `TranscriptWorkbench`
- `TranscriptHistoryList`
- `TranscriptHistoryRow`

Exact names can change during planning, but the transcript landing page should no longer depend on `RecordingsGrid` as its primary UI language.

## Data and Behavior Preservation

The redesign should preserve the current behavior contracts:

- use existing transcript and media hooks for data access
- preserve language persistence behavior
- preserve settings dialog entry points
- preserve delete behavior
- preserve transcript detail navigation

The redesign is primarily a presentation-layer and page-structure change. If implementation discovers a small amount of display-specific derivation is needed for row status or preview text, that is acceptable so long as it does not rewrite the underlying data model.

## `/transcript/live` Alignment Requirements

Light alignment work on the live page should focus on presentation only.

Expected improvements:

- bring utility triggers closer to the dashboard/transcript workbench control language
- make the surrounding shell and sticky rail feel less like an isolated one-off design
- keep the existing transcription panel and recording control choreography intact

The live page should still feel purpose-built for capture. The redesign should not add extra structure that slows access to the record controls.

## `/transcript/file/:id` Alignment Requirements

Light alignment work on the detail page should focus on shell continuity.

Expected improvements:

- adjust outer spacing, background tone, or header surface treatment if needed
- keep transcript reading and player interaction exactly as the current experience expects
- avoid broad structural changes that would require relearning the detail page

The detail page should look like it belongs to the same module as the new landing page, not like a separate product generation.

## Testing Requirements

Implementation planning should include validation for:

- `/transcript` rendering with no recordings
- `/transcript` rendering with multiple recordings and transcript preview data
- primary navigation to `/transcript/live`
- navigation from a transcript row into `/transcript/file/:id`
- delete behavior still working from the landing page
- settings entry points still opening the intended settings sections
- layout remaining usable on narrow screens
- reduced-motion behavior for any newly introduced animation

Visual verification should be part of implementation completion because this task is primarily about layout and system consistency.

## Open Implementation Decisions Already Resolved

- The redesign target is a restrained workbench, not a hero-style landing page.
- `/transcript` is the primary redesign target.
- `/transcript/live` and `/transcript/file/:id` receive only light visual alignment work.
- The landing page should move away from the generic card-grid presentation.
- The page should use one dominant history surface rather than multiple large competing cards.
- Motion should be subtle and nearly invisible in still frames.
