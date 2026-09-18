# Memora

Local-first personal knowledge and productivity app: capture (recordings, files, chat) and surface it back through a Desktop file browser and a Dashboard.

## Language

**Dashboard**:
The `/` route (`DashboardPage.tsx`). The app's landing surface; hosts the Home Grid.
_Avoid_: Home (used in conversation, but the route and component are named Dashboard)

**Home Grid**:
The fixed-slot grid of Widget Instances on the Dashboard. Reorder-only for v1 (no free resize/drag-to-arbitrary-position).

**Widget Definition**:
A saved, reusable widget template: a folder containing a render component and a data binding (its Catalog Entry reference). Generated definitions are created and saved from Chat; built-in definitions (calendar, todo, recent) ship with the app. Stored as a real folder in the Desktop filesystem, under a reserved Widgets folder.
_Avoid_: Widget (ambiguous on its own — always say Definition or Instance)

**Widget Instance**:
A specific placement of a Widget Definition on the Home Grid: position, size, and any instance-specific config (e.g. which folder it points at). One Definition can back multiple Instances.

**Widget kind**:
Distinguishes how a Widget Definition executes. `builtin`: trusted first-party React component with direct data access, no sandbox (calendar, todo, recent). `generated`: chat-authored render component, isolated in an iframe, receives data only through the bridge — never queries data itself.

**Data source catalog / Catalog entry**:
The fixed, host-owned registry of named, queryable data sources (e.g. `recentFiles`, `todoProgress`, `storageStats`) that a Widget Definition's data binding can reference. Chat picks a Catalog Entry by name when generating a widget; it cannot author arbitrary queries. New kinds of dynamic data are added by extending this catalog, not by giving generated code its own query access.
