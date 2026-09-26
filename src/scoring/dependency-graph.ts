export interface SourceFile {
  path: string;
  content: string;
}

export interface DependencyGraph {
  /** importer path -> resolved local paths it imports */
  edges: Map<string, Set<string>>;
}

const IMPORT_SPECIFIER_RE =
  /(?:import|export)(?:[^'"`;]*?from)?\s*['"]([^'"]+)['"]|(?:import|require)\(\s*['"]([^'"]+)['"]\s*\)/g;

const RESOLVE_EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const INDEX_SUFFIXES = ['/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
const KNOWN_EXTENSION_RE = /\.(m|c)?[jt]sx?$/i;

/**
 * Builds a local import graph from a set of source files by regex-scanning
 * for `import`/`export ... from` and `require(...)` specifiers. Only
 * relative specifiers (`./`, `../`) are resolved; bare package imports are
 * ignored since they fall outside the repo's own blast radius.
 */
export function buildDependencyGraph(files: SourceFile[]): DependencyGraph {
  const knownPaths = new Set(files.map((file) => file.path));
  const edges = new Map<string, Set<string>>();

  for (const file of files) {
    const deps = new Set<string>();

    for (const match of file.content.matchAll(IMPORT_SPECIFIER_RE)) {
      const specifier = match[1] ?? match[2];
      if (!specifier || !specifier.startsWith('.')) continue;

      const resolved = resolveSpecifier(file.path, specifier, knownPaths);
      if (resolved) deps.add(resolved);
    }

    edges.set(file.path, deps);
  }

  return { edges };
}

/** Counts how many other files in the graph import `targetPath`. */
export function countDependents(graph: DependencyGraph, targetPath: string): number {
  let count = 0;
  for (const [importer, deps] of graph.edges) {
    if (importer !== targetPath && deps.has(targetPath)) count += 1;
  }
  return count;
}

function resolveSpecifier(
  importerPath: string,
  specifier: string,
  knownPaths: Set<string>,
): string | undefined {
  const importerDir = importerPath.split('/').slice(0, -1).join('/');
  const joined = normalizePosixPath(importerDir ? `${importerDir}/${specifier}` : specifier);
  const withoutExt = joined.replace(KNOWN_EXTENSION_RE, '');

  for (const base of [withoutExt, joined]) {
    for (const ext of RESOLVE_EXTENSIONS) {
      const candidate = `${base}${ext}`;
      if (knownPaths.has(candidate)) return candidate;
    }
    for (const suffix of INDEX_SUFFIXES) {
      const candidate = `${base}${suffix}`;
      if (knownPaths.has(candidate)) return candidate;
    }
  }

  return undefined;
}

function normalizePosixPath(path: string): string {
  const stack: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}
