// Browser-safe stand-in for archify's generated JSON-Schema validator.
//
// Upstream validator.mjs imports ./generated-validators.mjs (~430 KB of
// compiled JSON-Schema). That artifact is intentionally not vendored — the
// route-map library constructs its own specs. This thin guard mirrors the
// subset of the official workflow.schema.json that the compiler depends on
// (top-level shape plus the required node fields), so structurally broken
// input still fails early with the same diagnostic-shaped Error the compiler
// understands. It is deliberately more permissive than the real schema where
// the compiler itself validates semantics (id patterns, duplicate ids, edge
// targets, geometry).

import { throwDiagnosticError } from './diagnostics.mjs';

function fail(code, message) {
  const diagnostics = [{
    code,
    severity: 'error',
    message,
    subject: { diagramType: 'workflow', path: '/' },
    evidence: {},
    supportedFixes: [],
  }];
  throwDiagnosticError(`workflow schema validation failed:\n- ${message}`, diagnostics);
}

function check(condition, code, message) {
  if (!condition) fail(code, message);
}

export function validateSchema(diagramType, data) {
  if (diagramType !== 'workflow') return; // only the workflow compiler runs here
  check(data && typeof data === 'object' && !Array.isArray(data), 'schema/type',
    '/ must be one workflow document object');
  check(data.schema_version === 1 || data.schema_version === 2, 'schema/enum',
    '/schema_version must be 1 or 2');
  check(data.diagram_type === 'workflow', 'schema/enum',
    '/diagram_type must be "workflow"');
  check(data.meta && typeof data.meta === 'object' && !Array.isArray(data.meta), 'schema/type',
    '/meta must be an object');
  check(typeof data.meta.title === 'string' && data.meta.title.trim() !== '', 'schema/required',
    '/meta/title is required');
  check(Array.isArray(data.lanes), 'schema/type', '/lanes must be an array');
  check(Array.isArray(data.nodes), 'schema/type', '/nodes must be an array');
  check(Array.isArray(data.edges), 'schema/type', '/edges must be an array');

  const nodes = data.nodes;
  const nodeIds = new Set();
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    check(node && typeof node === 'object' && !Array.isArray(node), 'schema/type',
      `/nodes/${index} must be an object`);
    check(typeof node.id === 'string' && node.id.trim() !== '', 'schema/required',
      `/nodes/${index}/id is required`);
    nodeIds.add(node.id);
    check(typeof node.lane === 'string' && node.lane.trim() !== '', 'schema/required',
      `/nodes/${index}/lane is required`);
    check(Number.isInteger(node.col), 'schema/type', `/nodes/${index}/col must be an integer`);
    check(node.col >= 0 && node.col <= 5, 'schema/maximum', `/nodes/${index}/col must be between 0 and 5`);
    check(typeof node.type === 'string' && node.type.trim() !== '', 'schema/required',
      `/nodes/${index}/type is required`);
    check(typeof node.label === 'string', 'schema/type', `/nodes/${index}/label must be a string`);
  }

  const laneIds = new Set(data.lanes
    .filter((lane) => lane && typeof lane === 'object')
    .map((lane) => lane.id));
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node && node.lane && !laneIds.has(node.lane)) {
      fail('schema/required', `/nodes/${index}/lane references unknown lane ${JSON.stringify(node.lane)}`);
    }
  }

  for (let index = 0; index < data.edges.length; index += 1) {
    const edge = data.edges[index];
    check(edge && typeof edge === 'object' && !Array.isArray(edge), 'schema/type',
      `/edges/${index} must be an object`);
    check(typeof edge.from === 'string' && edge.from.trim() !== '', 'schema/required',
      `/edges/${index}/from is required`);
    check(typeof edge.to === 'string' && edge.to.trim() !== '', 'schema/required',
      `/edges/${index}/to is required`);
  }
}
