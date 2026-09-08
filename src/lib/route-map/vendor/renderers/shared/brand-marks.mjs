// Browser-safe no-brand stand-in for archify's brand-marks module.
//
// Upstream brand-marks.mjs imports node:crypto / node:dns / node:http /
// node:https / node:net plus the ~160 KB generated-brand-marks.mjs and drives a
// remote brand-icon capture pipeline. Route-map specs never author
// `node.brand`, so none of that machinery is reachable. Every renderer helper
// the workflow compiler imports funnels through `brandMarkFor(node)`, which
// returns null until brand marks are prepared — so the stubs below reproduce
// the exact upstream no-brand return values:
//   brandLabelFitWidth -> width        (upstream: mark ? max(1, width - 48) : width)
//   brandMetadataFor   -> {}           (upstream: mark ? { brand, brandId, ... } : {})
//   brandTopRailProblem-> null         (upstream: !mark ? null : ...)
//   renderBrandMark    -> ''           (upstream: !mark ? '' : ...)
// brandMarkFor itself always resolves null because prepareDiagramBrandMarks
// (the async CLI capture step) is not part of this browser-safe subset.

export function brandMarkFor() {
  return null;
}

export function brandMetadataFor() {
  return {};
}

export function brandLabelFitWidth(_node, width) {
  return width;
}

export function brandTopRailProblem() {
  return null;
}

export function renderBrandMark() {
  return '';
}
