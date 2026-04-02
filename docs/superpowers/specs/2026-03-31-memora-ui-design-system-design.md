# Memora UI Design System Package Design

## Summary

This document defines the first shared UI package for the Memora workspace:
`@memora/ui`.

The package is intentionally scoped as a single shared UI library in v1 so that
imports stay simple while the component count is still relatively small. The
internal structure must still preserve future split points so that the package
can later separate into a brand-agnostic core layer and a Memora theme layer
without re-architecting the library.

The package exists to solve a real codebase problem that already shows up in
`@memora/web`:

- `@base-ui/react` primitives are imported directly across many surfaces
- typography is not yet governed by a single component-layer contract
- semantic Memora tokens exist, but components still fall back to `zinc-*` and
  literal hex values
- common UI patterns such as dialogs, menus, form controls, toasts, and progress
  styling are re-implemented or scattered across app-level files

The goal of `@memora/ui` is not to move feature UI into a shared package. The
goal is to create one reusable entry point for shared tokens, typography,
themed components, and primitive wrappers so that current and future apps can
adopt a single design system without carrying business logic inside the library.

## Current-State Audit

The existing `packages/web/src/components` tree is mostly feature UI:

- `chat/`
- `dashboard/`
- `desktop/`
- `library/`
- `onboarding/`
- `settings/`
- `transcript/`

Those directories contain product surfaces, not a reusable design system.

The real reusable design-system seeds currently present in `@memora/web` are:

- `components/ui/NativeDialog.tsx`
- `components/menu/AppMenu.tsx`
- `components/Progress.tsx`
- `components/ToastStack.tsx`
- `components/settings/settingsClassNames.ts`
- theme and token CSS in `src/index.css`, `src/styles/tokens.css`, and
  related style files

The codebase already shows enough cross-cutting reuse to justify a shared UI
package:

- direct `@base-ui/react/button` imports in many files
- direct `@base-ui/react/toast` imports in multiple app and settings flows
- direct `@base-ui/react/menu`, `tooltip`, `field`, `select`, and `progress`
  usage across multiple surfaces
- repeated dialog usage through `NativeDialog`
- repeated menu usage through the current `AppMenu` alias

The audit also shows that some components look reusable at first glance but are
still too app-specific for a shared v1 API:

- `Sidebar`
- `SearchPalette`
- `ReferencePicker`
- `ConfirmDialog`
- `LanguageSelector`
- `DesktopContextMenu`
- `FileCard`

Those should be rebuilt on top of shared primitives and themed components, but
they should remain app-layer components in `@memora/web` for now.

## Goals

- Create a new reusable package: `@memora/ui`.
- Keep import ergonomics simple in v1 by using a single package.
- Base the package on existing, proven headless primitives instead of writing a
  new primitive system from scratch.
- Use `@base-ui/react` as the primitive engine in v1.
- Provide Memora-themed components, shared tokens, typography, and core
  interaction patterns without embedding business logic.
- Make Storybook a first-class development and review environment for the UI
  package.
- Move the highest-value shared component patterns out of `@memora/web`.
- Centralize design tokens and typography decisions so apps stop solving them
  ad hoc.
- Prepare the package for a future split into `ui-core` and
  `ui-theme-memora` if the library grows.

## Non-Goals

- Rebuilding a primitive library from first principles.
- Moving feature surfaces from `@memora/web` wholesale into the shared package.
- Enforcing lint restrictions on `@memora/web` in the first pass.
- Replacing every existing component in one migration.
- Solving all app navigation, command palette, or workspace-shell patterns in
  v1.
- Building a brand-neutral public package in the first pass.

## Core Decision

### Package strategy

Use one package in v1:

- `@memora/ui`

The library should be externally simple but internally layered.

### Primitive strategy

Do not rewrite headless primitives.

Use:

- `@base-ui/react`

as the primitive engine behind the shared package.

### Theming strategy

The library should ship Memora-branded themed components in v1, not only raw
recipes. Consumers should be able to import ready-to-use components from
`@memora/ui` rather than rebuild common combinations from primitives.

### Consumption strategy

In the first implementation phase:

- `@memora/web` may still directly import `@base-ui/react`
- new shared work should prefer `@memora/ui`
- migration should happen incrementally

In a later governance phase:

- `@memora/web` should stop adding new direct primitive imports
- lint or review rules can enforce `@memora/ui` as the main component entry

## Proposed Package Structure

Create:

- `packages/ui`

with this internal shape:

```text
packages/ui/
  package.json
  tsconfig.json
  vite.config.ts
  src/
    index.ts
    components/
      button/
      dialog/
      menu/
      input/
      textarea/
      field/
      select/
      tooltip/
      toast/
      progress/
    primitives/
      base-ui/
    theme/
      tokens/
      typography/
      recipes/
      themes/
    styles/
      index.css
      theme-memora.css
    lib/
      cn.ts
      variants.ts
      slots.ts
  .storybook/
```

### Responsibility boundaries

#### `src/components`

Contains the public, themed components that apps should consume directly.

These components:

- wrap or compose Base UI primitives
- apply shared Memora styles
- expose stable props and variants
- avoid business logic and app-specific data dependencies

#### `src/primitives`

Contains thin primitive adapters or re-exports used by the themed component
layer.

This layer is internal in v1. It exists to preserve a future split point and to
keep direct Base UI coupling out of app code over time.

#### `src/theme`

Contains the design system source of truth:

- semantic tokens
- typography contract
- light and dark theme definitions
- shared recipes and style contracts

This is the most likely future extraction point if the package later splits into
brand-neutral core and Memora theme packages.

#### `src/styles`

Contains package-owned style entry points that consumers import once at the app
root.

This layer exists to centralize:

- CSS variables
- theme classes
- typography defaults
- shared utility classes or component contract classes

#### `src/lib`

Contains low-level helpers used by the package itself:

- class merging
- variant mapping
- slot helpers

This should stay internal to the package.

## Public API Design

### v1 import goal

The common case should be:

```ts
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
  Input,
  Textarea,
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  Select,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Progress,
  ToastProvider,
  ToastViewport,
} from "@memora/ui";
```

Apps should also import one package-owned style entry once:

```ts
import "@memora/ui/styles";
```

### Export policy

V1 should optimize for simplicity, not maximal granularity.

Recommended exports:

- root named exports from `@memora/ui`
- a styles entry such as `@memora/ui/styles`

Avoid a deep tree of subpath exports in the first pass unless implementation
needs it for build reasons. The main goal is to make adoption easy.

## V1 Component Scope

The first version of `@memora/ui` should include exactly the components that
already show strong cross-surface demand in `@memora/web`.

### Include in v1

#### Theme and typography foundation

- semantic Memora token contract
- light theme
- dark theme
- typography contract for serif titles and sans body/control usage
- shared motion timing and easing variables where already stable

#### Button

Include one shared button component with variants that cover current usage:

- primary
- secondary
- ghost
- destructive
- icon-only

This replaces repeated direct Base UI button usage plus local class duplication.

#### Input and Textarea

These should carry:

- tokenized border/background/text states
- placeholder styling
- focus ring behavior
- size consistency

They are needed immediately for settings and onboarding-style forms.

#### Field family

Create a small form field layer:

- `Field`
- `FieldLabel`
- `FieldDescription`
- `FieldError`

This should define spacing and text hierarchy for form controls.

#### Select

Create a themed select surface built from Base UI select primitives. This is
needed to replace special-case styling like the current `LanguageSelector`.

#### Dialog

Dialog is mandatory in v1. It already represents a shared interaction pattern
used in multiple places.

The package should provide a small dialog composition surface around the current
project-owned native dialog implementation:

- `Dialog`
- `DialogContent`
- `DialogHeader`
- `DialogTitle`
- `DialogDescription`
- `DialogFooter`
- optional close button slot if needed

Important: the package should own the reusable dialog pattern, but app-level
compositions such as `ConfirmDialog` can remain in `@memora/web`.

#### Menu

Menu is also mandatory in v1.

The current `AppMenu` is only an alias to a dashboard-specific implementation.
That pattern should be replaced with a package-owned menu abstraction that can
serve dashboard, transcript, and future shared menu use cases:

- `Menu`
- `MenuTrigger`
- `MenuContent`
- `MenuItem`
- optional separators and labels as needed

#### Tooltip

Tooltip already appears in multiple places and is a standard shared interaction
layer.

#### Toast

Toast behavior and layout are already distributed through app surfaces and
settings flows. The UI package should own:

- provider
- viewport
- toast container contract
- tone variants

The app should not keep rebuilding toast styling.

#### Progress

Progress is small but cross-cutting and should become a shared themed component.

### Exclude from v1

Keep these in `@memora/web` for now:

- `Sidebar`
- `SearchPalette`
- `ReferencePicker`
- `ConfirmDialog`
- `LanguageSelector`
- `DesktopContextMenu`
- `FileCard`
- transcript page shells
- dashboard widgets

Reason:

they are app-specific compositions that should consume the shared primitives and
themed components, not define the initial public API of the UI library.

## Styling Model

### Core principle

The package must become the main owner of tokens, typography, and component
style contracts.

The current situation in `@memora/web` shows that style consistency is ahead of
token discipline. V1 should reverse that by making the package the main place
where component styling is authored.

### Required outcomes

- components should stop hardcoding fonts
- components should stop inventing local hex values for shared structure
- shared UI surfaces should stop falling back to `zinc-*` for core product UI

### Token strategy

The package should define and export semantic Memora tokens for:

- shell and canvas
- surface layers
- border layers
- text tiers
- hover, selected, active, and focus states
- warning, danger, and success tones
- file-type accents where broadly reusable
- typography
- motion timing and easing

### Typography strategy

The package should define the single font contract used by all consuming apps.

Recommended direction:

- serif role: `IBM Plex Serif`
- sans role: `Inter`
- fallbacks remain in the token layer, not in component files

Components may choose between semantic typography roles, but they should not
declare literal font family names directly.

### CSS ownership

Apps should import package-owned styles from `@memora/ui/styles`.

That style entry should include:

- theme variables
- typography defaults
- component contract classes if needed
- any package-level CSS required by the components

## Storybook Strategy

Storybook should ship with the package from day one.

### Purpose

Storybook is not an afterthought demo site. It is the main isolated development
environment for `@memora/ui`.

Use it for:

- component development
- variant review
- accessibility review
- theme review in both light and dark mode
- visual documentation for consumers

### Story coverage in v1

Each v1 component should have stories for:

- default state
- variant states
- disabled state where relevant
- focus-visible state where relevant
- dark mode rendering
- long-label or dense-content cases where relevant

### Story organization

Colocate stories with components or place them under a package-local stories
folder. Either is acceptable, but the chosen pattern must stay consistent.

The more important requirement is that Storybook belongs to `packages/ui`, not
to `@memora/web`.

## Migration Strategy

Migration must be incremental. The package should prove usefulness before
enforcement is added.

### Phase 1: package foundation

- create `packages/ui`
- add theme and styles entry
- add Storybook
- implement v1 component set

### Phase 2: highest-value adoption in `@memora/web`

Migrate shared patterns first:

- dialog consumers
- menu consumers
- settings and onboarding form controls
- shared buttons
- shared progress
- shared toast presentation

This phase should produce the most visible reduction in duplicated style logic.

### Phase 3: app-level recomposition

Rebuild app-level components on top of `@memora/ui`:

- `ConfirmDialog`
- `LanguageSelector`
- transcript menus
- dashboard menus
- settings forms

### Phase 4: governance

Only after the package is stable:

- stop adding new direct `@base-ui/react` usage in app code
- consider lint or review rules enforcing `@memora/ui` as the preferred entry
- consider codemods or cleanup passes for remaining app-local primitive usage

## Build and Packaging Expectations

The package should behave like a reusable workspace library.

Expected characteristics:

- built output suitable for app consumption
- exported type definitions
- one stable style entry
- Storybook runnable as an isolated package workflow

Implementation planning can decide the exact scripts and bundler details, but the
package should align with the monorepo's existing Vite+ and workspace patterns.

## Accessibility Requirements

The package must treat accessibility as a baseline contract, not a theme-layer
nice-to-have.

Minimum expectations:

- keyboard reachability
- visible focus states
- semantic labeling support
- reduced-motion respect where components animate
- theme parity across light and dark
- no color-only meaning in shared control states

The package should aim above WCAG A where practical, especially for contrast,
focus clarity, and dense knowledge-work surfaces.

## Risks

### Risk: package becomes a dumping ground

If feature components are moved too early, `@memora/ui` will stop being a design
system and become a second app tree.

Mitigation:

- keep v1 restricted to shared primitives and themed components
- explicitly exclude app-specific shells and workflows

### Risk: theming remains incomplete

If tokens are added but components still rely on local `zinc-*` and hex values,
the package will not actually centralize design decisions.

Mitigation:

- make v1 components package-owned and fully themed
- migrate high-frequency shared surfaces first

### Risk: package API hardens too early

If too many components enter v1, the public API will freeze around app-specific
patterns.

Mitigation:

- keep v1 intentionally narrow
- prefer composition over promoting app-level patterns too early

## Future Split Readiness

Even though v1 is a single package, the internal shape should preserve a future
split path:

- `ui-core`
  primitive wrappers and low-level contracts
- `ui-theme-memora`
  tokens, themes, recipes, and themed components

This future split is explicitly deferred, not rejected.

## Testing and Verification Expectations

Implementation planning should include:

- component story coverage in Storybook
- keyboard and focus behavior checks
- light and dark theme checks
- visual verification for dialog, menu, field, and select layering
- build verification for package exports and style entry

## Decisions Already Resolved

- v1 uses a single package: `@memora/ui`
- the package is shared across future apps
- the package must not contain business logic
- the package should use `@base-ui/react` primitives rather than rewriting them
- Storybook is required
- `Dialog` is mandatory in v1
- shared menu behavior is mandatory in v1
- form basics are mandatory in v1
- direct app imports from `@base-ui/react` are allowed during migration
- lint enforcement is deferred until after the package proves itself
