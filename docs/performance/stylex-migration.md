# StyleX migration performance comparison

The measurements use Lighthouse 13.4.1 and its default mobile throttling profile against a local production preview. The post-migration values are the median of three fresh-browser runs after verifying that StyleX styles render in Chrome. The pre-migration baseline is one retained cold-cache run, so this is a directional local comparison rather than field data.

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Performance score | 52 | 52 | 0 points |
| FCP | 10,252 ms | 10,126 ms | -127 ms |
| LCP | 19,734 ms | 20,220 ms | +486 ms |
| TTI | 19,741 ms | 20,227 ms | +486 ms |
| Total blocking time | 213 ms | 214 ms | +1 ms |
| CLS | 0.00003 | 0.00000 | -0.00003 |
| Speed index | 11,167 ms | 10,126 ms | -1,041 ms |
| JavaScript transfer | 2,215,465 B | 2,306,253 B | +90,788 B |
| Stylesheet transfer | 195,241 B | 62,703 B | -132,538 B |
| Total transfer | 3,093,228 B | 3,051,478 B | -41,750 B |

The current configuration injects StyleX's compiled rules when application modules evaluate, because static extraction is not preserved by the current Vite+/Rolldown output pipeline. This moves 90.8 kB of transfer into JavaScript while eliminating 132.5 kB of stylesheet transfer, for a 41.8 kB smaller measured page. FCP and Speed Index improved in this sample; LCP and TTI were about 486 ms slower, while blocking time was effectively unchanged.

All four Lighthouse files emitted the warning that the local page exceeded its load-time limit. Collect field data or repeated runs on a representative device and connection before making a release decision.
