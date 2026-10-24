# Rendered scene regression probe

Run a short cold game through the real app, without a seeded state, hidden
engine access, React inspection, or a production test hook:

```sh
node tests/visual-regression/check.mjs --url=http://127.0.0.1:5173 --headed --out=/private/tmp/cringestone-visual-fixed
node tests/visual-regression/check.mjs --url=http://127.0.0.1:5173 --browser=webkit --out=/private/tmp/cringestone-visual-webkit
```

The script starts a fresh context, keeps the opening hand, and inspects the
same raised card at seven face locations. Each pointer position stays still
for about two seconds. Its visible preview must retain the card name and
hovering must leave the battle log unchanged. A DOM MutationObserver records
brief preview removals between screenshots. Public pointer coordinates and
leave/focus events distinguish outside input in a headed window from a
stationary-pointer failure; omit `--headed` to isolate the native cursor. Add
`--hover-only` for a focused run without ending the first turn.
Pointer coordinates project the
documented card/camera geometry; update these if the layout deliberately changes.

Chromium additionally captures compositor frames, sampled about every 60 ms.
A nearly uniform black region in the centre of the table after it first
appears fails the check. WebKit uses the sequential screenshots and the same
DOM checks, so it cannot establish the absence of a flash between screenshots.
No framebuffer reads, preserveDrawingBuffer overrides, or render instrumentation
change the game. Standard WebGL context events and browser errors are recorded.

The first active hand, settled hand, each hover, and the next turn's draw are
saved as PNGs. First-hand composition is **visual evidence for review**, not an
automatic assertion that every card occupies the correct slot: no private scene
nodes are read and no golden image is imposed on random card artwork. Report
JSON contains public hand labels, pointer coordinates, preview changes, pixel
metrics, errors, and failures. Exit code is nonzero when an assertion fails.

When the application offers **Меню → Скачать диагностику**, the probe also
downloads that public report to `diagnostics.json`. It checks readiness, action
events, renderer details and initial loading, then rejects a later Suspense
fallback, context loss or JavaScript error. Older baseline builds without this
button remain usable.

The two-turn probe is separate from full-match E2E and performance measurements.
Only 17 ordinary screenshots and up to 12 anomalous compositor frames are
written; normal compositor images are discarded after pixel analysis.
