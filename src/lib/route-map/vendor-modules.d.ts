// Ambient type declarations for the plain-JavaScript vendored ESM modules.
// TypeScript cannot type-check the vendor .mjs sources (allowJs is off), so the
// bridge is declared explicitly here; runtime resolution is unchanged.

declare module '*/vendor/bridge.mjs' {
  export interface RouteStageSpec {
    id: string;
    label: string;
    sublabel?: string;
  }
  export interface RouteMapInput {
    title: string;
    stages: RouteStageSpec[];
  }
  export type WorkflowSvgResult = { svg: string } | { error: string };
  export interface FillTemplateInput {
    template: string;
    title: string;
    svg: string;
    locale?: string;
    visualPreset?: string;
  }
  export function buildRouteWorkflowSpec(route: RouteMapInput): unknown;
  export function compileWorkflowSvg(spec: unknown): WorkflowSvgResult;
  export function fillTemplateHtml(input: FillTemplateInput): string;
  export function postRenderStateScript(): string;
}
