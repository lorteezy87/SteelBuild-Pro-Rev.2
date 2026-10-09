# Bundle budgets and the IFC WASM measurement correction

Run `npm run build`, then `npm run perf:bundle`. The report uses KiB
(1,024 bytes) and gzip compression of each emitted file independently.

| Measurement | Default gzip limit | Environment variable |
| --- | ---: | --- |
| JS/CSS referenced directly by `dist/index.html` | 320 KiB | `SBP_MAX_INITIAL_GZIP_KB` |
| All JS/CSS under `dist/assets`, recursively | 3,600 KiB | `SBP_MAX_TOTAL_GZIP_KB` |
| All WASM under `dist`, recursively | 500 KiB | `SBP_MAX_WASM_GZIP_KB` |

The original two limits are unchanged. The existing `TOTAL` variable retains
its name for CI compatibility and now explicitly measures JS/CSS. All three
limits must be positive finite decimal numbers; an unset variable selects the
default, while empty, zero, negative, nonnumeric and infinite values fail.
The combined JS/CSS/WASM size is also reported. Separate enforced JS/CSS and
WASM budgets mean unused headroom in one category cannot offset excess in the
other. This is an asset-size check, not a measured page-load transfer or a
complete inventory of images, fonts, source maps and other static content.

Before the hashed IFC loader change, Vite's copy plugin placed the WASM file
at `dist/wasm/web-ifc.wasm`. The old report enumerated only `dist/assets`, so
its historical “total generated assets” measurements excluded that file.
Earlier audit totals near 3,200 KiB therefore represented generated JS/CSS,
not the full JS/CSS/WASM payload. Moving WASM into hashed `dist/assets` made
the old script count an additional file; it did not itself add another IFC
engine download. Comparing the combined result against the old 3,600 KiB
JS/CSS limit would silently change the meaning of that limit.

The October 9 local build that exposed this discrepancy measured 3,211.2 KiB
gzip JS/CSS plus 467.9 KiB WASM, or 3,679.1 KiB combined. Those are measurements
of that build, not fixed expected outputs or proof of deployment. Run the
report again after source or dependency changes.

The viewer now imports `web-ifc/web-ifc.wasm?url`, allowing Vite to emit a
content-hashed file alongside its matching loader. The old copy plugin and
local `public/wasm/web-ifc.wasm` copy are removed. Every emitted WASM file is
counted by path, including nested legacy copies outside `assets`; identical
copies are not deduplicated. For this approximately 468 KiB engine, a second
copy would exceed the 500 KiB limit. The budget report does not itself verify
that a filename is hashed or that the browser loaded the matching version;
release artifact and real-viewer checks provide those separate assurances.

`scripts/__tests__/perfBundleReport.test.ts` runs the actual script in temporary
build directories. It covers separate caps, recursive and duplicate WASM,
nested JS/CSS, initial-entry deduplication, exact thresholds and invalid
environment settings. Tests neither build nor deploy the application.
