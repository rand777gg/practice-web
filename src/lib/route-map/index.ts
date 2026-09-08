// Route-map diagram API for React: compile a linear stage route into the
// official archify workflow HTML artifact at runtime, then drive per-stage
// progress coloring over postMessage / window.__routeMapState.
//
// Usage sketch (inside a component):
//
//   const spec = buildRouteWorkflowSpec({ title, stages });          // typed route
//   const { svg } = compileRouteMapSvg(spec);                        // { svg } | { error }
//   const html = assembleRouteMapHtml({ spec, svg, locale: 'zh-CN' });
//   // render `html` in an <iframe srcDoc={html}> (or srcdoc) ...
//   // later, per progress update:
//   frame.contentWindow?.postMessage(routeMapStateMessage(state), '*');
//   // state: Record<stageId, 'done' | 'current' | 'todo'>
//
// routeMapStateMessage returns a JSON string that can be posted directly; the
// injected page script also accepts a plain object payload of the same shape
// and exposes window.__routeMapState(state) for repeated updates.

import * as bridge from './vendor/bridge.mjs';
import templateHtml from './vendor/template.html?raw';

export interface RouteStageSpec {
  id: string;
  label: string;
  sublabel?: string;
}

export interface RouteMapInput {
  title: string;
  stages: RouteStageSpec[];
}

export type RouteStageStateValue = 'done' | 'current' | 'todo';

/** nodeId (stage.id) → progress status; every stage id the caller manages. */
export type RouteStageState = Record<string, RouteStageStateValue>;

/** Result of compiling a workflow specification to SVG. */
export type RouteMapSvgResult = { svg: string } | { error: string };

export interface AssembleRouteMapHtmlOptions {
  /** The spec passed to compileRouteMapSvg (used for meta.title / locale). */
  spec: unknown;
  /** The svg from compileRouteMapSvg. */
  svg: string;
  /** Template UI locale; defaults to spec.meta.locale, then 'zh-CN'. */
  locale?: string;
}

/** Build a schema-v2 workflow document for a linear route of stages. */
export function buildRouteWorkflowSpec(route: RouteMapInput): unknown {
  return bridge.buildRouteWorkflowSpec(route);
}

/** Synchronously compile a route workflow spec into the SVG fragment. */
export function compileRouteMapSvg(spec: unknown): RouteMapSvgResult {
  return bridge.compileWorkflowSvg(spec);
}

function routeMeta(spec: unknown): { title?: unknown; locale?: unknown } | null {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return null;
  const meta = (spec as { meta?: unknown }).meta;
  return meta && typeof meta === 'object' && !Array.isArray(meta) ? (meta as { title?: unknown; locale?: unknown }) : null;
}

/**
 * Assemble the complete self-contained HTML artifact: the vendored official
 * template filled with the SVG, plus the injected progress-coloring
 * <style>/<script> block (inserted right before </body>).
 */
export function assembleRouteMapHtml({ spec, svg, locale }: AssembleRouteMapHtmlOptions): string {
  const meta = routeMeta(spec);
  const title = typeof meta?.title === 'string' && meta.title.trim() !== '' ? meta.title : 'Route Map';
  const resolvedLocale = locale
    ?? (typeof meta?.locale === 'string' && meta.locale.trim() !== '' ? meta.locale : 'zh-CN');
  const filled = bridge.fillTemplateHtml({ template: templateHtml, title, svg, locale: resolvedLocale });
  const injection = bridge.postRenderStateScript();
  const bodyEnd = filled.lastIndexOf('</body>');
  if (bodyEnd === -1) return `${filled}\n${injection}`;
  return `${filled.slice(0, bodyEnd)}${injection}\n${filled.slice(bodyEnd)}`;
}

/**
 * Serialize a progress state into a postMessage-ready payload:
 * JSON string of { type: 'route-map-state', state }. The injected script
 * accepts the string as-is (or the equivalent plain object).
 */
export function routeMapStateMessage(state: RouteStageState): string {
  return JSON.stringify({ type: 'route-map-state', state });
}
