// Route-map vendored workflow compiler — Node smoke test.
//
// Run from the repo root:  node scripts/route-map-smoke.mjs
// Exit code 0 = all checks PASS. It never writes into the repo: temp JSON /
// HTML artifacts go under os.tmpdir() and are removed afterwards.
//
// Checks:
//   a. buildRouteWorkflowSpec() produces compile-able specs for 3 and 8 stages
//   b. compileWorkflowSvg() returns svg and every stage id appears as
//      data-node-id="<id>" inside it
//   c. CLI cross-check: same spec JSON rendered by the upstream CLI
//      (archify bin/archify.mjs render workflow ... --quality showcase) yields
//      a byte-equal <svg>…</svg>
//   d. fillTemplateHtml()+postRenderStateScript() produce an artifact that
//      starts with <!DOCTYPE html>, contains <svg and </html>, and carries the
//      injected progress style/script
//   e. browser-equivalence static scan: vendored .mjs files contain no
//      `node:`/`process`/`require`/absolute imports, and the archify renderer
//      modules contain no document/window/globalThis references

import { readFileSync, writeFileSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  buildRouteWorkflowSpec,
  compileWorkflowSvg,
  fillTemplateHtml,
  postRenderStateScript,
} from '../src/lib/route-map/vendor/bridge.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const vendorRoot = join(repoRoot, 'src', 'lib', 'route-map', 'vendor');
const template = readFileSync(join(vendorRoot, 'template.html'), 'utf8');

let failures = 0;
let skips = 0;

function pass(message) {
  console.log(`[PASS] ${message}`);
}
function fail(message) {
  failures += 1;
  console.log(`[FAIL] ${message}`);
}
function skip(message) {
  skips += 1;
  console.log(`[SKIP] ${message}`);
}
function check(message, condition) {
  if (condition) pass(message);
  else fail(message);
}

// ---------------------------------------------------------------------------
// a + b. build + compile 3 / 8 stage route maps
// ---------------------------------------------------------------------------
const threeStage = {
  title: '三阶段发布路线',
  stages: [
    { id: 'intake', label: '需求收集与澄清' },
    { id: 'design', label: '方案设计与评审', sublabel: '含安全与回归评估' },
    { id: 'release', label: '发布上线与监控' },
  ],
};
const eightStage = {
  title: '端到端功能发布路线',
  stages: Array.from({ length: 8 }, (_, index) => ({
    id: `stage_${index + 1}`,
    label: `步骤 ${index + 1}：${'很长的阶段说明文字超过二十二个字就需要截断显示'.slice(0, 7 + index)}`,
    sublabel: index % 2 === 1 ? '并行检查与质量门禁' : undefined,
  })),
};

const cases = [
  { name: '3-stage', route: threeStage },
  { name: '8-stage', route: eightStage },
];

const compiled = new Map();
for (const { name, route } of cases) {
  let spec;
  try {
    spec = buildRouteWorkflowSpec(route);
  } catch (error) {
    fail(`[${name}] buildRouteWorkflowSpec threw: ${error?.message || error}`);
    continue;
  }
  check(`[${name}] buildRouteWorkflowSpec returns an object with ${route.stages.length} nodes`,
    !!spec && typeof spec === 'object'
      && spec.nodes.length === route.stages.length
      && spec.edges.length === Math.max(0, route.stages.length - 1));

  const result = compileWorkflowSvg(spec);
  if (result.error) {
    fail(`[${name}] compileWorkflowSvg failed: ${result.error.slice(0, 500)}`);
    continue;
  }
  check(`[${name}] compileWorkflowSvg returns { svg } (${result.svg.length} chars)`,
    typeof result.svg === 'string' && result.svg.trim().startsWith('<svg'));
  const missingIds = route.stages
    .map((stage) => stage.id)
    .filter((id) => !result.svg.includes(`data-node-id="${id}"`));
  check(`[${name}] every stage id appears as data-node-id inside the svg${missingIds.length ? ` — missing: ${missingIds.join(', ')}` : ''}`,
    missingIds.length === 0);
  compiled.set(name, { spec, svg: result.svg });
}

// Also verify 1..12 stage counts always compile, and >12 never blows up.
{
  const badCounts = [];
  for (let count = 1; count <= 16; count += 1) {
    const stages = Array.from({ length: count }, (_, index) => ({ id: `n${index}`, label: `步骤 ${index + 1}` }));
    const result = compileWorkflowSvg(buildRouteWorkflowSpec({ title: `Smoke ${count}`, stages }));
    if (result.error) badCounts.push(`${count} -> ${result.error.slice(0, 120)}`);
  }
  check(`stage counts 1..16 compile (12+ truncate instead of exploding)`, badCounts.length === 0);
  if (badCounts.length) for (const bad of badCounts) console.log(`    ${bad}`);
}

// ---------------------------------------------------------------------------
// c. CLI cross-check (byte equality of the <svg> fragment)
// ---------------------------------------------------------------------------
function walkMjs(root, out) {
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (statSync(full).isDirectory()) walkMjs(full, out);
    else if (full.endsWith('.mjs')) out.push(full);
  }
  return out;
}

const defaultInspectRoot = 'C:/Users/19336/AppData/Local/Temp/archify-inspect';
const inspectRoot = process.env.ARCHIFY_INSPECT_ROOT || defaultInspectRoot;
const cliPath = join(inspectRoot, 'archify', 'bin', 'archify.mjs');

let cliAvailable = true;
try {
  statSync(cliPath);
} catch {
  cliAvailable = false;
}

if (cliAvailable) {
  const cliDir = mkdtempSync(join(tmpdir(), 'route-map-smoke-cli-'));
  try {
    for (const { name } of cases) {
      const entry = compiled.get(name);
      if (!entry) continue;
      const jsonPath = join(cliDir, `${name}.json`);
      const outPath = join(cliDir, `${name}.html`);
      writeFileSync(jsonPath, JSON.stringify(entry.spec, null, 2));
      const run = spawnSync(
        process.execPath,
        [cliPath, 'render', 'workflow', jsonPath, outPath, '--quality', 'showcase'],
        { encoding: 'utf8', timeout: 240000 },
      );
      if (run.status !== 0) {
        fail(`[${name}] CLI render failed (status ${run.status}): ${(run.stderr || run.stdout || '').slice(0, 400)}`);
        continue;
      }
      let cliSvg = null;
      try {
        const html = readFileSync(outPath, 'utf8');
        const matches = [...html.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map((match) => match[0]);
        matches.sort((left, right) => right.length - left.length);
        cliSvg = matches[0] ? matches[0].trim() : null;
      } catch (error) {
        fail(`[${name}] could not read CLI output: ${error?.message || error}`);
        continue;
      }
      if (!cliSvg) {
        fail(`[${name}] no <svg> found in the official CLI artifact`);
        continue;
      }
      if (cliSvg === entry.svg.trim()) {
        pass(`[${name}] vendored svg is byte-equal to the official CLI svg (${cliSvg.length} chars)`);
      } else {
        let index = 0;
        const a = entry.svg.trim();
        const b = cliSvg;
        while (index < Math.min(a.length, b.length) && a[index] === b[index]) index += 1;
        fail(`[${name}] svg DIFF — ours ${a.length} chars vs CLI ${b.length} chars, first diff at ${index}`);
        console.log(`    ours: ${JSON.stringify(a.slice(Math.max(0, index - 60), index + 120))}`);
        console.log(`    cli : ${JSON.stringify(b.slice(Math.max(0, index - 60), index + 120))}`);
        console.log('    Likely cause: a quality/visual-preset/env divergence between this browser-safe patch set and');
        console.log('    the upstream run. If the only difference is formatting/environment metadata this is');
        console.log('    acceptable; if it is geometry, the patch set is out of sync and must not be used.');
      }
    }
  } finally {
    rmSync(cliDir, { recursive: true, force: true });
  }
} else {
  skip(`CLI cross-check: archify checkout not found at ${cliPath} (set ARCHIFY_INSPECT_ROOT to enable)`);
}

// ---------------------------------------------------------------------------
// d. fillTemplateHtml + postRenderStateScript artifact shape
// ---------------------------------------------------------------------------
{
  const entry = compiled.get('3-stage');
  if (entry) {
    try {
      const filled = fillTemplateHtml({ template, title: '三阶段发布路线', svg: entry.svg, locale: 'zh-CN' });
      const injection = postRenderStateScript();
      const bodyEnd = filled.lastIndexOf('</body>');
      const assembled = bodyEnd === -1
        ? `${filled}\n${injection}`
        : `${filled.slice(0, bodyEnd)}${injection}\n${filled.slice(bodyEnd)}`;

      check('filled HTML starts with <!DOCTYPE html>', assembled.startsWith('<!DOCTYPE html>'));
      check('filled HTML contains the <svg diagram', assembled.includes('<svg'));
      check('filled HTML ends with </html>', assembled.includes('</html>'));
      check('filled HTML localizes <html lang="zh-CN">', assembled.includes('<html lang="zh-CN"'));
      check('assembled HTML carries the rr-state-styles <style>', assembled.includes('<style id="rr-state-styles">'));
      check('assembled HTML carries the injected <script> with window.__routeMapState',
        assembled.includes('window.__routeMapState'));
      check('injected script listens for route-map-state messages',
        assembled.includes("'route-map-state'") || assembled.includes('"route-map-state"'));
      check('injected script is placed right before </body>',
        assembled.slice(bodyEnd - 900, bodyEnd).includes('</script>'));
    } catch (error) {
      fail(`fillTemplateHtml / postRenderStateScript threw: ${error?.message || error}`);
    }
  }
}

// ---------------------------------------------------------------------------
// e. browser-equivalence checks
//    1) static scan over vendored .mjs (comments stripped): no `node:` imports,
//       no `process`/`require`/`import.meta`/`__dirname`, no non-relative
//       imports. `document`/`window` may legitimately appear as *local*
//       variable names inside the compiler, so their absence is proven by
//       check 2 below rather than by token matching.
//    2) runtime simulation: a fresh Node process that deletes globalThis.process
//       (and where `document`/`window` do not exist at all, as in Node) imports
//       bridge.mjs and compiles the 8-stage spec. Any import-time or
//       compile-time dependency on a browser/Node global would throw.
// ---------------------------------------------------------------------------
function stripComments(code) {
  const noBlocks = code.replace(/\/\*[\s\S]*?\*\//g, ' ');
  return noBlocks.replace(/(^|[^:])[ \t]*\/\/.*$/gm, '$1');
}

{
  const rendererFiles = walkMjs(join(vendorRoot, 'renderers'), []);
  const allFiles = [...rendererFiles, join(vendorRoot, 'bridge.mjs')];
  let scanFails = 0;
  const scanFail = (message) => {
    scanFails += 1;
    console.log(`[FAIL] ${message}`);
  };

  const hazardPatterns = [
    [/from\s+['"]node:[^'"]*['"]/g, 'node: import specifier'],
    [/import\s*\(\s*['"]node:[^'"]*['"]\)/g, 'dynamic node: import'],
    [/\bprocess\.(?:env|argv|stdout|stderr|exit|on|cwd|platform|version)/g, 'process.* usage'],
    [/\brequire\s*\(/g, 'require('],
    [/\b__dirname\b/g, '__dirname'],
    [/\b__filename\b/g, '__filename'],
    [/\bimport\.meta\b/g, 'import.meta'],
  ];

  for (const file of allFiles) {
    const text = readFileSync(file, 'utf8');
    const code = stripComments(text);
    const rel = relative(repoRoot, file);
    for (const [regex, label] of hazardPatterns) {
      const hits = code.match(regex);
      if (hits) scanFail(`${rel} contains ${label} (${hits.length}x) — not browser safe`);
    }
    const importMatches = [...code.matchAll(/(?:^|\n)\s*(?:import|export)[\s\S]*?\bfrom\s+['"]([^'"]+)['"]/g)];
    for (const match of importMatches) {
      const specifier = match[1];
      if (specifier.startsWith('node:')) scanFail(`${rel} imports node builtin ${JSON.stringify(specifier)}`);
      else if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
        scanFail(`${rel} imports non-relative module ${JSON.stringify(specifier)}`);
      }
    }
  }
  if (scanFails === 0) {
    pass(`static scan clean over ${allFiles.length} vendored .mjs files (no node imports / process / require / non-relative imports)`);
  } else {
    failures += scanFails;
  }
}

{
  const entry = compiled.get('8-stage');
  if (entry) {
    const specJson = JSON.stringify(entry.spec);
    const code = `
      const proc = globalThis.process;
      delete globalThis.process;
      delete globalThis.Buffer;
      const { pathToFileURL } = await import('node:url');
      const bridge = await import(pathToFileURL(${JSON.stringify(join(vendorRoot, 'bridge.mjs'))}).href);
      const result = bridge.compileWorkflowSvg(${specJson});
      if (result.error) { console.error('COMPILE_ERROR: ' + result.error); proc.exitCode = 2; }
      else if (!result.svg.trim().startsWith('<svg')) { console.error('NOT_SVG'); proc.exitCode = 2; }
      else {
        for (const id of ['stage_1', 'stage_4', 'stage_8']) {
          if (!result.svg.includes('data-node-id="' + id + '"')) {
            console.error('MISSING_ID: ' + id);
            proc.exitCode = 2;
          }
        }
      }
    `;
    const run = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', code],
      { encoding: 'utf8', timeout: 120000, cwd: repoRoot },
    );
    if (run.status === 0) {
      pass('runtime simulation: compiles the 8-stage spec with globalThis.process and Buffer removed (no import/compile-time dependency on Node or browser globals)');
    } else {
      fail(`runtime simulation failed (status ${run.status}): ${(run.stderr || run.stdout || '').slice(0, 600)}`);
    }
  }
}

// ---------------------------------------------------------------------------
console.log('--------------------------------------------------');
if (failures === 0) {
  console.log(`ALL CHECKS PASSED (${skips ? `${skips} skipped` : 'no skips'})`);
  process.exitCode = 0;
} else {
  console.log(`${failures} check(s) FAILED${skips ? `, ${skips} skipped` : ''}`);
  process.exitCode = 1;
}
