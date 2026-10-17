# Code analysis

Run Fallow from the repository root. Local setup uses Fallow 3.32.0, matching the version pinned in `.github/workflows/fallow-audit.yml` and `.github/workflows/fallow-security.yml`.

## Audit changes

Before committing or opening a PR, compare with the branch's starting commit or intended PR base:

```sh
rtk proxy sh -c 'fallow audit --base <ref> --format json --quiet --explain 2>/dev/null || true'
```

Read the JSON verdict and findings. `audit.gate` is `new-only`: existing findings stay visible, and only new findings affect the gate. CI already uses this mode, so setup does not need a committed backlog baseline. Use `--base HEAD` to check uncommitted work against the current commit, and the intended PR base to check the whole branch.

For a whole-project inventory:

```sh
rtk proxy sh -c 'fallow dead-code --format json --quiet --explain 2>/dev/null || true'
rtk proxy sh -c 'fallow health --hotspots --targets --format json --quiet --explain 2>/dev/null || true'
```

Exit code 1 normally means findings; exit code 2 means a configuration or runtime error. These agent commands retain JSON output despite nonzero exits: check for an error envelope before interpreting findings. CI and hooks retain Fallow's exit status to enforce the gate.

## Verify cleanup findings

Trace consumers before removing code or dependencies:

```sh
rtk proxy sh -c 'fallow dead-code --trace <file>:<export> --format json --quiet --explain 2>/dev/null || true'
rtk proxy sh -c 'fallow dead-code --trace-file <file> --format json --quiet --explain 2>/dev/null || true'
rtk proxy sh -c 'fallow dead-code --trace-dependency <package> --format json --quiet --explain 2>/dev/null || true'
```

Check dynamic loading and framework contracts alongside the trace. Preview supported automatic fixes with `fallow fix --dry-run` before applying them. Setup findings are a backlog to review; setup does not authorize deleting reported code.

For class members, add `--unused-class-members --type-aware` to the whole-project dead-code command above and inspect each finding's `semantic` evidence. Preserve inherited framework callbacks, public package contracts, and candidates with partial evidence or dynamic member access. A syntactic unused-member finding alone is insufficient evidence for deletion.

Ambient type packages can be used through triple-slash references without imports. `@livestore/peer-deps` supplies LiveStore's peer dependencies, and the marketing site compiles Web components that use `@stylexjs/stylex`. Check these indirect uses before removing dependency candidates.

## Project entry points

Fallow discovers pnpm workspaces, package exports, Vite applications, workers, and conventional tests automatically. `.fallowrc.json` adds roots that the current detector misses:

- `tsdown.config.ts` files used by `vp pack`.
- `test/browser/**/*.browser.ts` and `.tsx` files selected by browser Vitest configurations.
- The marketing site's LiveStore stub, selected through a regular-expression Vite alias.
- The local-index E2E HTML page and the LiveStore devtools setup module imported by a Vite virtual module.
- The standalone BEIR HTML page and its reranker script, which selects worker pools dynamically.
- The standalone OCW transcript converter documented in `docs/agent-observability-evaluation.md`.

Keep `packages/web/src/generated-routes.ts` in the analysis graph: its imports connect the router to page components. Excluding it can make live pages appear unused.

The broad `packages/*/*` pattern in `pnpm-workspace.yaml` also matches source and test directories without `package.json`. Fallow 3.32.0 reports these as workspace diagnostics. Check the actual package inventory with `fallow workspaces` before treating a missing-manifest diagnostic as a missing package.

## Verified exceptions

Keep exceptions tied to a runtime contract or a located caller. The project uses these mechanisms:

- `ignoreExports` exempts only the router's `Component` export under `pages/`, the development playground's lazy route `Component`, and the generated route map's `default` export. Other exports in those files remain checked.
- `usedClassMembers` allows Lexical lifecycle and serialization methods only on subclasses of the named Lexical base types. It also preserves `setMarkdownSourcePrefix` on heading and list-item nodes because `WysiwygDocumentEditor` calls it after node type guards. Other getters, setters, and registry methods remain checked.
- `ignoreDependencies` lists the exact names `@livestore/peer-deps`, `@stylexjs/stylex`, `@types/audioworklet`, and `@webgpu/types` for their peer, source-compilation, and ambient-type roles. Fallow applies this list repository-wide and excludes both unused and unlisted dependency findings for those names; recheck package placement manually when adding their consumers. `@types/dom-webcodecs` remains reportable pending separate verification.
- A `fallow-ignore-next-line unused-class-member -- <reason>` comment covers a verified call through a type guard, object property, selected BEIR pool, or the Transformers custom-cache contract. The reason identifies the caller or contract. Keep these exceptions on individual methods.

Suppression reasons are required at warning severity, and stale-suppression detection retains its default warning severity. Revisit exceptions when callers or frameworks change. Dynamic-member uncertainty alone does not justify an exception. Core package methods and other unresolved candidates remain reportable; the configuration does not mark entire packages public or disable unused-member detection.

## Local hooks

Inspect installed hooks with `fallow hooks status --format json --quiet`. Fallow can install a Git pre-commit gate and agent-specific checks; these are local checkout settings and are not distributed by committing the project configuration. The repository ignores `.codex/` and `.claude/`.

Use `fallow hooks install --target git --branch HEAD` for a pre-commit fallback against the current commit when the branch has no upstream. Use `fallow hooks install --target agent --agent codex` for Codex, or `--agent claude` for Claude Code. Inspect existing hooks before installing and preserve user-owned content. Remove only Fallow-managed hooks with the corresponding `fallow hooks uninstall` target.
