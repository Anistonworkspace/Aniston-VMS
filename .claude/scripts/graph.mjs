#!/usr/bin/env node
// Lightweight codebase dependency graph (Node, zero deps). Built-in fallback for
// /graph when the full Graphify (Python: Tree-sitter + NetworkX) isn't installed.
// Scans backend/src, frontend/src, shared/src for import statements and answers
// "what depends on X" / "what does X import" without grepping the whole repo.
//
// Usage:
//   node .claude/scripts/graph.mjs build
//   node .claude/scripts/graph.mjs deps <path>       # what <path> imports (local)
//   node .claude/scripts/graph.mjs inbound <path>    # what imports <path>
//   node .claude/scripts/graph.mjs explain <path>    # imports + inbound + size

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative, extname } from 'node:path';

const ROOT = process.cwd();
const SRC_DIRS = ['backend/src', 'frontend/src', 'shared/src'];
const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];
const GRAPH_DIR = join(ROOT, '.claude', 'graph');
const GRAPH_FILE = join(GRAPH_DIR, 'graph.json');

// Path aliases used in this repo (tsconfig "paths").
const ALIASES = [
  { prefix: '@/', to: 'frontend/src/' },
  { prefix: '@boilerplate/shared', to: 'shared/src/index' },
];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '__tests__' || name === 'dist') continue;
      walk(p, out);
    } else if (EXTS.includes(extname(name))) {
      out.push(p);
    }
  }
  return out;
}

function rel(p) {
  return relative(ROOT, p).split('\\').join('/');
}

// Resolve an import specifier to a repo-relative file path, or null if external.
function resolveSpec(spec, fromFile) {
  let base = null;
  if (spec.startsWith('./') || spec.startsWith('../')) {
    base = resolve(dirname(fromFile), spec);
  } else {
    for (const a of ALIASES) {
      if (spec === a.prefix || spec.startsWith(a.prefix)) {
        const rest = spec === a.prefix ? '' : spec.slice(a.prefix.length);
        base = resolve(ROOT, a.to + rest);
        break;
      }
    }
  }
  if (!base) return null; // external package
  // Strip a trailing .js (ESM import of a .ts source) and try candidates.
  const noExt = base.replace(/\.(js|ts|tsx|jsx|mjs)$/, '');
  const candidates = [
    base,
    ...EXTS.map((e) => noExt + e),
    ...EXTS.map((e) => join(noExt, 'index' + e)),
  ];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return rel(c);
  }
  return null;
}

const IMPORT_RE =
  /(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function buildGraph() {
  const files = SRC_DIRS.flatMap((d) => walk(join(ROOT, d)));
  const edges = []; // { from, to }
  const nodes = new Set();
  for (const f of files) {
    const rf = rel(f);
    nodes.add(rf);
    const src = readFileSync(f, 'utf8');
    let m;
    while ((m = IMPORT_RE.exec(src)) !== null) {
      const spec = m[1] || m[2];
      if (!spec) continue;
      const target = resolveSpec(spec, f);
      if (target) {
        edges.push({ from: rf, to: target });
        nodes.add(target);
      }
    }
  }
  return { generatedAt: null, files: files.length, nodes: [...nodes].sort(), edges };
}

function loadGraph() {
  if (!existsSync(GRAPH_FILE)) {
    console.error('No graph yet. Run: node .claude/scripts/graph.mjs build');
    process.exit(1);
  }
  return JSON.parse(readFileSync(GRAPH_FILE, 'utf8'));
}

function matchNode(g, needle) {
  const n = needle.split('\\').join('/');
  const exact = g.nodes.find((x) => x === n);
  if (exact) return exact;
  const hits = g.nodes.filter((x) => x.includes(n));
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) {
    console.error(`Ambiguous "${needle}":`);
    hits.slice(0, 10).forEach((h) => console.error('  ' + h));
    process.exit(1);
  }
  console.error(`No node matches "${needle}". Try /graph build, or a partial path.`);
  process.exit(1);
}

const [, , cmd, arg] = process.argv;

if (cmd === 'build') {
  mkdirSync(GRAPH_DIR, { recursive: true });
  const g = buildGraph();
  writeFileSync(GRAPH_FILE, JSON.stringify(g, null, 2));
  console.log(
    `Built graph: ${g.files} files, ${g.nodes.length} nodes, ${g.edges.length} edges → .claude/graph/graph.json`
  );
} else if (cmd === 'deps') {
  const g = loadGraph();
  const node = matchNode(g, arg);
  const deps = [...new Set(g.edges.filter((e) => e.from === node).map((e) => e.to))].sort();
  console.log(`${node} imports (${deps.length}):`);
  deps.forEach((d) => console.log('  → ' + d));
  if (!deps.length) console.log('  (no local imports)');
} else if (cmd === 'inbound') {
  const g = loadGraph();
  const node = matchNode(g, arg);
  const inbound = [...new Set(g.edges.filter((e) => e.to === node).map((e) => e.from))].sort();
  console.log(`${node} is imported by (${inbound.length}):`);
  inbound.forEach((d) => console.log('  ← ' + d));
  if (!inbound.length) console.log('  (nothing imports it — leaf or entry point)');
} else if (cmd === 'explain') {
  const g = loadGraph();
  const node = matchNode(g, arg);
  const deps = [...new Set(g.edges.filter((e) => e.from === node).map((e) => e.to))].sort();
  const inbound = [...new Set(g.edges.filter((e) => e.to === node).map((e) => e.from))].sort();
  const lines = existsSync(join(ROOT, node))
    ? readFileSync(join(ROOT, node), 'utf8').split('\n').length
    : '?';
  console.log(`# ${node}  (${lines} lines)`);
  console.log(`\nImports ${deps.length} local module(s):`);
  deps.forEach((d) => console.log('  → ' + d));
  console.log(`\nImported by ${inbound.length} module(s):`);
  inbound.forEach((d) => console.log('  ← ' + d));
} else {
  console.log(`Usage:
  node .claude/scripts/graph.mjs build
  node .claude/scripts/graph.mjs deps <path>
  node .claude/scripts/graph.mjs inbound <path>
  node .claude/scripts/graph.mjs explain <path>`);
  process.exit(cmd ? 1 : 0);
}
