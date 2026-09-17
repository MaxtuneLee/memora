# StyleX migration performance comparison

The measurements use Lighthouse 13.4.1 and its default mobile throttling profile against a local production preview.

## Pre-migration (Tailwind, commit `a74b2d7`) vs. current (StyleX static extraction)

This is the direct comparison against the pre-migration codebase: the last commit before StyleX was introduced (`a74b2d7`, checked out into a separate worktree), built and served the same way as the current tree with the `cssInjectionTarget` fix applied. Median of three fresh-browser runs on both sides.

The numbers below were captured with the `@layer reset` variant described in "Runtime injection vs. static extraction" — since superseded by `useCSSLayers: false` (see that section for why). Both produce the same static-extraction output shape; the `@layer` wrapper syntax it adds/removes is a handful of bytes, well under the noise floor of these measurements, so the numbers stand.

| Metric              | Pre-migration (Tailwind) | Current (StyleX, fixed) |    Change |       % |
| ------------------- | -----------------------: | ----------------------: | --------: | ------: |
| Performance score   |                       54 |                      54 |  0 points |   0.00% |
| FCP                 |                10,425 ms |                9,369 ms | -1,056 ms | -10.13% |
| LCP                 |                19,616 ms |               19,512 ms |   -104 ms |  -0.53% |
| TTI                 |                19,616 ms |               19,519 ms |    -97 ms |  -0.49% |
| Total blocking time |                   146 ms |                  171 ms |    +25 ms | +17.12% |
| CLS                 |                   0.0000 |                  0.0000 |    0.0000 |     n/a |
| Speed index         |                10,442 ms |                9,369 ms | -1,073 ms | -10.28% |
| JavaScript transfer |              2,210,429 B |             2,190,954 B | -19,475 B |  -0.88% |
| Stylesheet transfer |                163,653 B |                93,267 B | -70,386 B | -43.01% |
| Total transfer      |              3,089,358 B |             2,993,207 B | -96,151 B |  -3.11% |

StyleX's atomic-CSS output is more compact than the Tailwind bundle it replaced: stylesheet transfer drops by 70.4 kB and total page weight by 96.2 kB, with FCP and Speed Index roughly a second faster. TBT is the one metric that moved against StyleX (+25 ms), still small in absolute terms. Performance score is identical — as with the other comparisons in this doc, the score here is capped by a >10 MB unsplit JS chunk that has nothing to do with the CSS approach.

## Migration history

The sections below record the two intermediate measurements taken along the way: the initial migration (pre-migration vs. the first working configuration, which used runtime injection), and the follow-up fix that moved from runtime injection to static extraction. The comparison above supersedes both for a bottom-line pre- vs. post-migration number; these are kept for context on why the configuration changed twice.

### Initial migration (single cold-cache baseline)

The post-migration values below are the median of three fresh-browser runs after verifying that StyleX styles render in Chrome. The pre-migration baseline is one retained cold-cache run, so this is a directional local comparison rather than field data — see the three-run comparison above for a more rigorous number.

| Metric              |      Before |       After |     Change |       % |
| ------------------- | ----------: | ----------: | ---------: | ------: |
| Performance score   |          52 |          52 |   0 points |   0.00% |
| FCP                 |   10,252 ms |   10,126 ms |    -127 ms |  -1.23% |
| LCP                 |   19,734 ms |   20,220 ms |    +486 ms |  +2.46% |
| TTI                 |   19,741 ms |   20,227 ms |    +486 ms |  +2.46% |
| Total blocking time |      213 ms |      214 ms |      +1 ms |  +0.47% |
| CLS                 |     0.00003 |     0.00000 |   -0.00003 |     n/a |
| Speed index         |   11,167 ms |   10,126 ms |  -1,041 ms |  -9.32% |
| JavaScript transfer | 2,215,465 B | 2,306,253 B |  +90,788 B |  +4.10% |
| Stylesheet transfer |   195,241 B |    62,703 B | -132,538 B | -67.88% |
| Total transfer      | 3,093,228 B | 3,051,478 B |  -41,750 B |  -1.35% |

The current configuration injects StyleX's compiled rules when application modules evaluate, because static extraction is not preserved by the current Vite+/Rolldown output pipeline. This moves 90.8 kB of transfer into JavaScript while eliminating 132.5 kB of stylesheet transfer, for a 41.8 kB smaller measured page. FCP and Speed Index improved in this sample; LCP and TTI were about 486 ms slower, while blocking time was effectively unchanged.

All four Lighthouse files emitted the warning that the local page exceeded its load-time limit. Collect field data or repeated runs on a representative device and connection before making a release decision.

### Runtime injection vs. static extraction (`cssInjectionTarget`)

The row above used runtime injection (`runtimeInjection: true`) because the StyleX unplugin's default target picker only matches unhashed `index.css`/`style.css` filenames, so it never matches Vite's hashed output and silently falls back to the first CSS asset in the bundle — not necessarily the stylesheet every page loads. Passing an explicit `cssInjectionTarget` that matches the hashed entry stylesheet fixes this, restoring static extraction.

Enabling static extraction with `useCSSLayers: true` surfaced a cascade-layer bug: `src/index.css`'s global reset had no explicit `@layer` position, so once StyleX's `@layer priority1..10` output landed in the same stylesheet, the (implicitly highest-priority, unlayered) reset started winning over StyleX's styles. The fix was tried as an explicit `@layer reset, priority1, ..., priority10;` order declaration with the reset wrapped in `@layer reset { ... }`, but that only works when `index.css` is the _first_ stylesheet to declare layer order — true in production (one `<link>`, first in `<head>`), false in dev, where StyleX serves its own CSS via an earlier-loading `<link rel="stylesheet" href="/virtual:stylex.css">` and `index.css` only loads later via JS module evaluation. Since `priority1..10` get established first by that earlier stylesheet in dev, `index.css`'s later order declaration can only append `reset` at the _end_ (highest priority again), reproducing the same bug in dev only.

Cross-stylesheet `@layer` ordering is load-order dependent and not worth relying on here. The actual fix: set `useCSSLayers: false`. Unlayered StyleX class selectors (`.x1a2b3c {}`, specificity 0,1,0) beat most of the reset's unlayered element selectors (`button {}`, specificity 0,0,1) on specificity alone, regardless of which stylesheet loads first or in what order. This doesn't hold universally, though: a few reset rules combine selectors (e.g. `button:not(:disabled), [role="button"]:not(:disabled) { cursor: pointer; }`, specificity 0,1,1) and would still beat a single StyleX class targeting the same property. No component styled in this migration sets `cursor`, so there's no live conflict today, but a future StyleX style overriding `cursor` on a `<button>` would need `useCSSLayers` revisited or a higher-specificity override.

Measurements use the same methodology as above: Lighthouse 13.4.1, default mobile throttling, local production preview, median of three fresh-browser runs per configuration.

| Metric              | Runtime injection | Static extraction (fixed) |     Change |        % |
| ------------------- | ----------------: | ------------------------: | ---------: | -------: |
| Performance score   |                54 |                        54 |   0 points |    0.00% |
| FCP                 |          9,306 ms |                  9,381 ms |     +75 ms |   +0.81% |
| LCP                 |         19,786 ms |                 19,608 ms |    -178 ms |   -0.90% |
| TTI                 |         19,786 ms |                 19,608 ms |    -178 ms |   -0.90% |
| Total blocking time |            170 ms |                    166 ms |      -4 ms |   -2.35% |
| CLS                 |           0.00036 |                   0.00000 |   -0.00036 |      n/a |
| Speed index         |          9,592 ms |                  9,381 ms |    -211 ms |   -2.20% |
| JavaScript transfer |       2,290,727 B |               2,185,918 B | -104,809 B |   -4.58% |
| Stylesheet transfer |          29,949 B |                  93,267 B |  +63,318 B | +211.42% |
| Total transfer      |       3,035,951 B |               2,988,170 B |  -47,781 B |   -1.57% |

Static extraction moves ~104.8 kB out of JavaScript (no more inline `stylex.inject()` calls and style-object literals per component) and into the stylesheet (+63.3 kB), for a net 47.8 kB smaller page. Timing metrics moved within run-to-run noise (single-digit-to-low-hundreds of ms) except CLS, which dropped to zero — plausible given styles are now present before first paint instead of being applied by JavaScript after evaluation, removing a source of post-load layout shift. The performance score is unchanged; this app's Lighthouse score is dominated by a >10 MB unsplit JS chunk (flagged separately by the build), which swamps any signal from this change.

This comparison is a correctness fix (styles reliably reaching the page they're needed on, see the layer bug above) more than a performance win — treat the byte and CLS deltas as a secondary benefit, not the primary motivation.
