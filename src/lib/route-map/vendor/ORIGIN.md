# ORIGIN — vendored archify workflow compiler

This directory ports the **workflow graph compiler** of the open-source
[archify](https://github.com/archify/archify) project into a browser-safe,
self-contained module set for `practice-web`. It lets the app compile a JSON
workflow specification at runtime into the official archify self-contained
HTML diagram artifact (inline SVG + styles + viewer JS), plus helpers that
recolor nodes by stage id for progress display.

## Upstream provenance

- Repository: `archify` (MIT license — see `LICENSE`)
- Commit: `10722002bb8777ecb639d93c49586fae4adf3ae4`
- Version: `2.17.0-dev.1` (reported by `assets/template.html` as `archify 2.17.0-dev.1`)
- Fetched as a read-only shallow clone at the time of porting
- Relevant upstream paths (relative to the repo root):

```
archify/renderers/workflow/workflow-compiler.mjs     (4400 lines, the compiler)
archify/renderers/workflow/workflow-migration-geometry.mjs
archify/renderers/shared/*.mjs                       (shared helpers)
archify/assets/template.html                         (773 KB self-contained HTML template)
schemas/*.json, examples/*.workflow.json             (referenced for the spec shape)
```

## Purpose

`bridge.mjs` exposes `compileWorkflowSvg`, `buildRouteWorkflowSpec`,
`fillTemplateHtml` and `postRenderStateScript`. The TypeScript layer in
`../index.ts` wraps them for React. The compiler itself is synchronous and pure
(strings in, strings out); the whole vendored tree has no top-level Node side
effects, no `document`/`window` references, and no `node:` imports, so it can
be executed inside a browser bundle (only the returned `postRenderStateScript`
string mentions `document`/`window` — it is the viewer script the caller
injects into the generated HTML).

## Layout vs upstream

To preserve the compiler's original relative imports
(`../shared/utils.mjs`, `./workflow-migration-geometry.mjs`, ...), the upstream
`renderers/` folder structure is mirrored:

```
vendor/
  bridge.mjs                        (new — facade, browser + Node safe)
  template.html                     (upstream assets/template.html, verbatim)
  LICENSE                           (upstream LICENSE, verbatim)
  renderers/workflow/workflow-compiler.mjs
  renderers/workflow/workflow-migration-geometry.mjs
  renderers/shared/geometry.mjs
  renderers/shared/i18n.mjs
  renderers/shared/legend.mjs
  renderers/shared/text-fit.mjs
  renderers/shared/utils.mjs
  renderers/shared/cli.mjs          (trimmed)
  renderers/shared/diagnostics.mjs  (trimmed)
  renderers/shared/validator.mjs    (replaced by a minimal guard)
  renderers/shared/brand-marks.mjs  (replaced by no-brand stubs)
```

Not vendored (by design): `generated-validators.mjs` (~430 KB),
`generated-brand-marks.mjs` (~160 KB), the other typed renderers
(architecture/sequence/dataflow/lifecycle), `bin/`, CLI shells
(`render-workflow.mjs`, `cli.mjs` file I/O half), the brand capture pipeline
(`repository-evidence.mjs`, `engineering-profiles.mjs`, `output-path.mjs`,
`repository-location.mjs`, `desktop-readability.mjs`, `layout-report.mjs`), the
async brand network modules, tests, benchmarks and docs.

## Patch list (every deviation from upstream)

### `renderers/shared/cli.mjs` — trimmed CLI shell
Upstream is the CLI tail: it imports `node:fs` / `node:path`,
`repository-evidence.mjs`, `engineering-profiles.mjs`, `output-path.mjs`,
`brand-marks.mjs`, calls `installRendererDiagnosticBoundary()` at module scope
and exports `loadDiagram`, `loadDiagramWithBrandMarks`, `writeDiagram`,
`validateRelationshipIds`, `validateGuidedViews` alongside the pure SVG-attr
helpers the workflow compiler imports.
- Removed: the two `node:` imports and every import/export that pulls Node I/O
  or brand/repository machinery; removed the module-scope
  `installRendererDiagnosticBoundary()` call.
- Kept byte-for-byte: `svgAccessibleText`, `animateAttr`, `focusNodeAttrs`,
  `focusNodeTitle`, `focusEdgeAttrs`.
- `svgRootAttrs`: one changed line — the upstream
  `const requestedProfile = process.env.ARCHIFY_QUALITY_PROFILE || meta.quality_profile;`
  became `const requestedProfile = meta.quality_profile;` (browsers have no
  env; the authored quality profile is authoritative). Output is identical to
  the CLI run without `ARCHIFY_QUALITY_PROFILE`, which is how the CLI behaves
  when `--quality` is omitted.

### `renderers/shared/diagnostics.mjs` — trimmed diagnostics
- Removed: `import fs from 'node:fs'`, `import path from 'node:path'`.
- `const DIAGNOSTIC_MODE` was `process.env.ARCHIFY_DIAGNOSTIC_FORMAT === 'json'`
  → hard-coded `false` (diagnostic JSON recording is a CLI concern).
- Removed the CLI-only crash boundary: `installRendererDiagnosticBoundary`,
  `fallbackDiagnostic`, `rendererFailure` and the `process.on`/`fs.writeSync`
  wiring.
- Kept with original bodies: `plainObject`, `normalizedDiagnostic`,
  `recordDiagnostic`, `withDiagnosticRecordingSuppressed`,
  `throwDiagnosticError`, `throwDiagnosticProblems`.

### `renderers/shared/validator.mjs` — replaced
Upstream imports the 430 KB `./generated-validators.mjs` and runs full
JSON-Schema validation. That artifact is not vendored: the library constructs
its own specs and the compiler validates layout semantically anyway. Replaced
with a small structural guard that mirrors the subset of the official
`workflow.schema.json` the compiler depends on (top-level shape, `meta.title`,
required `lanes/nodes/edges` arrays, per-node `id/lane/col/type/label`, col
range `0..5`, edge `from`/`to`, unknown lane reference). It throws the same
diagnostic-shaped `Error` (`throwDiagnosticError`) so failures surface through
`compileWorkflow`'s normal `{ ok: false, ... }` path. It is deliberately more
permissive than the real schema where the compiler re-validates (id patterns,
duplicate ids, edge targets).

### `renderers/shared/brand-marks.mjs` — replaced by no-brand stubs
Upstream imports `node:crypto` / `node:dns/promises` / `node:http` /
`node:https` / `node:net` and the 160 KB `generated-brand-marks.mjs`, and
implements async remote brand-icon capture. Route-map specs never author
`node.brand`, so none of it is reachable. Every renderer helper the workflow
compiler imports funnels through `brandMarkFor(node)`, which returns `null`
until `prepareDiagramBrandMarks` runs — so the stubs reproduce the exact
upstream no-brand return values:
`brandLabelFitWidth → width`, `brandMetadataFor → {}`,
`brandTopRailProblem → null`, `renderBrandMark → ''`, and `brandMarkFor`
always returns `null`. (`prepareDiagramBrandMarks` / `findBrandMark` /
`listBrandMarks` / `isPrivateBrandAddress` etc. were CLI/authoring-only and are
gone.)

### `renderers/shared/geometry.mjs` — one line
`qualityProfileForGate(profile, profileIsAuthoritative)` dropped its
`process.env.ARCHIFY_QUALITY_PROFILE || profile` fallback and now returns
`profile`. Byte-identical to the CLI when no `ARCHIFY_QUALITY_PROFILE` env
override is set. No other change (1423 lines otherwise untouched).

### `renderers/workflow/workflow-compiler.mjs` — verbatim
No patch. All browser-hostile behavior it could reach was neutralized in the
shared modules above.

### `renderers/workflow/workflow-migration-geometry.mjs` — verbatim
Pure module; no change.

### `renderers/shared/{i18n,legend,text-fit,utils}.mjs` — verbatim
Pure modules; no changes. (`utils.mjs` keeps `applyTemplate`/`renderCards`/
`esc`/`textUnits`/`renderDefinitions`/`renderSemanticSigil`; `bridge.mjs`
reuses `applyTemplate` + `renderCards([])` + `textUnits` directly, so
`fillTemplateHtml` is exactly the upstream `writeDiagram` fill behaviour.)

### `template.html`, `LICENSE` — verbatim copies
`template.html` is the self-contained official HTML template (placeholders
`[VISUAL PRESET]`, `[PROJECT NAME]`, `[Subtitle description]`, the
`ARCHIFY:SVG_SLOT_*` / `ARCHIFY:CARDS_SLOT_*` sentinels and the
GUIDED_VIEWS / SOURCE_EVIDENCE / I18N data placeholders). `LICENSE` is the
upstream MIT license text.

### Verification of byte-parity with the official CLI
The smoke script renders the same JSON with the upstream CLI
(`bin/archify.mjs render workflow ... --quality showcase`) and compares the
`<svg>…</svg>` extracted from its HTML against `compileWorkflowSvg` output:
they match byte-for-byte for the generated linear specs.
