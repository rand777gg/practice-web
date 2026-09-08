// bridge.mjs — browser-safe facade over the vendored archify workflow compiler.
//
// Pure ESM: imports only the vendored modules under ./renderers, never a
// `node:` builtin and never a `?raw` asset, so Node and the Vite bundler can
// both import it. All exported functions are synchronous and side-effect free.
//
// - compileWorkflowSvg   -> compileWorkflow() result, normalized to {svg} | {error}
// - buildRouteWorkflowSpec -> construct a linear workflow document (schema v2)
// - fillTemplateHtml    -> applyTemplate() behaviour (svg/cards/i18n slots)
// - postRenderStateScript -> <style> + <script> that recolor nodes by stage id

import { compileWorkflow } from './renderers/workflow/workflow-compiler.mjs';
import { applyTemplate, renderCards, textUnits } from './renderers/shared/utils.mjs';

const MAX_STAGES = 12;
const CHAIN_RANKS = 6; // readable-v2 ranks are fixed at 0..5
const NODE_WIDTH = 160;
// A label of 22 text units (~22 ASCII chars or ~11 CJK chars) is the largest
// that passes the compiler's node-width gate (units * 6.8 <= width + 6) at a
// 160px node, and 22 text units also fits at the 9px label legibility minimum.
const MAX_LABEL_UNITS = 22;
const MAX_SUBLABEL_UNITS = 36; // fits a 160px node at the 6px sublabel minimum
const LANE_LABEL_UNITS = 24;
const ELLIPSIS = '\u2026';

function truncateByUnits(text, maxUnits) {
  const points = Array.from(String(text ?? '').trim());
  if (points.length === 0) return '';
  const joined = points.join('');
  if (textUnits(joined) <= maxUnits) return joined;
  for (let len = points.length - 1; len >= 1; len -= 1) {
    const candidate = points.slice(0, len).join('');
    if (textUnits(candidate + ELLIPSIS) <= maxUnits) return candidate + ELLIPSIS;
  }
  return ELLIPSIS;
}

// A route becomes a linear main path of `stages`. Up to 6 stages fit the six
// readable-v2 ranks of one lane; additional stages (up to 12) continue the
// chain in a second lane starting at rank 0. More than 12 stages are trimmed
// (宁可少放): the compiler's rank grid is fixed at six columns, so extra stages
// would force layout that cannot satisfy its own legibility gates.
export function buildRouteWorkflowSpec({ title, stages }) {
  const routeTitle = typeof title === 'string' && title.trim() !== '' ? title.trim() : 'Route Map';
  const source = Array.isArray(stages)
    ? stages.filter((stage) => stage && typeof stage.id === 'string' && stage.id.trim() !== '')
    : [];
  const used = source.slice(0, MAX_STAGES);

  const laneLabel = truncateByUnits(routeTitle, LANE_LABEL_UNITS);
  const lanes = used.length > CHAIN_RANKS
    ? [
        { id: 'route', label: laneLabel },
        { id: 'route-cont', label: laneLabel },
      ]
    : [{ id: 'route', label: laneLabel }];

  const nodes = used.map((stage, index) => ({
    id: stage.id,
    lane: index < CHAIN_RANKS ? 'route' : 'route-cont',
    col: index < CHAIN_RANKS ? index : index - CHAIN_RANKS,
    type: 'backend',
    label: truncateByUnits(stage.label || stage.id, MAX_LABEL_UNITS),
    ...(stage.sublabel ? { sublabel: truncateByUnits(stage.sublabel, MAX_SUBLABEL_UNITS) } : {}),
    width: NODE_WIDTH,
  }));

  const edges = [];
  for (let index = 0; index + 1 < nodes.length; index += 1) {
    edges.push({ from: nodes[index].id, to: nodes[index + 1].id });
  }

  return {
    schema_version: 2,
    diagram_type: 'workflow',
    meta: {
      title: routeTitle,
      locale: 'zh-CN',
      quality_profile: 'showcase',
    },
    lanes,
    phases: [],
    groups: [],
    nodes,
    edges,
    cards: [],
  };
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function summarizeFailure(result) {
  const diagnostics = Array.isArray(result?.diagnostics)
    ? result.diagnostics
      .map((diagnostic) => `[${diagnostic.code}] ${diagnostic.message}`)
      .join(' | ')
    : '';
  const error = typeof result?.error === 'string' && result.error ? result.error : 'Workflow compilation failed.';
  return diagnostics ? `${error} (${diagnostics})` : error;
}

// Synchronously compile a workflow document into its SVG fragment. `quality`
// is taken from spec.meta.quality_profile and defaults to 'showcase'.
export function compileWorkflowSvg(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return { error: 'compileWorkflowSvg expects one workflow specification object.' };
  }
  let workflow;
  try {
    workflow = cloneJson(spec);
  } catch (error) {
    return { error: `Workflow specification could not be serialized: ${error?.message || String(error)}` };
  }
  const meta = workflow.meta && typeof workflow.meta === 'object' ? workflow.meta : {};
  if (typeof meta.quality_profile !== 'string' || !meta.quality_profile) {
    meta.quality_profile = 'showcase';
  }
  try {
    const result = compileWorkflow({ workflow });
    if (result && result.ok === true && typeof result.svg === 'string') {
      return { svg: result.svg };
    }
    return { error: summarizeFailure(result) };
  } catch (error) {
    return { error: error?.message || String(error) };
  }
}

// Simulates upstream writeDiagram's applyTemplate step for an in-memory
// template string: fills the [VISUAL PRESET] / [PROJECT NAME] / SVG / CARDS /
// subtitle / i18n slots. `cards` are intentionally empty.
export function fillTemplateHtml({ template, title, svg, locale = 'zh-CN', visualPreset = 'classic' }) {
  return applyTemplate(template, {
    title,
    subtitle: '',
    svg,
    cards: renderCards([]),
    locale,
    visualPreset,
    guidedViews: [],
    sourceEvidence: null,
  });
}

const STATE_STYLE_ID = 'rr-state-styles';

// Colouring rules for done / current / todo stages. Only the node root's own
// primary shapes (direct rect/circle/path/ellipse/polygon children) are tinted
// so the result reads on any theme; todo stages are dimmed wholesale. Colors
// are fixed so no archify-internal class or CSS variable is required.
const STATE_CSS = [
  `svg [data-node-id].rr-done > rect,`,
  `svg [data-node-id].rr-done > circle,`,
  `svg [data-node-id].rr-done > path,`,
  `svg [data-node-id].rr-done > ellipse,`,
  `svg [data-node-id].rr-done > polygon {`,
  `  stroke: #16a34a !important;`,
  `  stroke-width: 2.2 !important;`,
  `  fill: rgba(34, 197, 94, 0.16) !important;`,
  `}`,
  `svg [data-node-id].rr-current > rect,`,
  `svg [data-node-id].rr-current > circle,`,
  `svg [data-node-id].rr-current > path,`,
  `svg [data-node-id].rr-current > ellipse,`,
  `svg [data-node-id].rr-current > polygon {`,
  `  stroke: #f59e0b !important;`,
  `  stroke-width: 2.2 !important;`,
  `  fill: rgba(245, 158, 11, 0.22) !important;`,
  `}`,
  `svg [data-node-id].rr-todo {`,
  `  opacity: 0.5;`,
  `}`,
].join('\n');

// Returns a <style id="rr-state-styles"> + <script> block to append right
// before </body>. The script boots once the DOM is ready, listens for
// window 'message' events of shape { type: 'route-map-state', state }, and
// applies rr-done / rr-current / rr-todo classes to every `svg [data-node-id]`
// element. It also exposes window.__routeMapState(state) for direct updates.
export function postRenderStateScript() {
  const cssJson = JSON.stringify(STATE_CSS);
  const script = `(function () {
  'use strict';
  var STATE_CSS = ${cssJson};
  var STYLE_ID = '${STATE_STYLE_ID}';
  function classFor(value) {
    if (value === 'done') return 'rr-done';
    if (value === 'current') return 'rr-current';
    if (value === 'todo') return 'rr-todo';
    return null; // unknown / absent: leave the node untouched
  }
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STATE_CSS;
    (document.head || document.documentElement).appendChild(style);
  }
  function applyState(state) {
    if (!state || typeof state !== 'object') return;
    var nodes = document.querySelectorAll('svg [data-node-id]');
    for (var i = 0; i < nodes.length; i += 1) {
      var el = nodes[i];
      var next = classFor(state[el.getAttribute('data-node-id')]);
      if (!next) continue;
      el.classList.remove('rr-done', 'rr-current', 'rr-todo');
      el.classList.add(next);
    }
  }
  function stateFromMessage(data) {
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (error) { return null; }
    }
    if (data && typeof data === 'object' && data.type === 'route-map-state') {
      return data.state;
    }
    return null;
  }
  function boot() {
    try {
      ensureStyle();
      window.__routeMapState = function (state) { applyState(state); };
      window.addEventListener('message', function (event) {
        var state = stateFromMessage(event.data);
        if (state) applyState(state);
      });
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'route-map-ready' }, '*');
      }
    } catch (error) {
      // never let the coloring bridge break the diagram viewer
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();`;
  return `<style id="${STATE_STYLE_ID}">\n${STATE_CSS}\n</style>\n<script>\n${script}\n</script>`;
}
