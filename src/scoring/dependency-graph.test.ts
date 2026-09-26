import { describe, expect, it } from 'vitest';
import { buildDependencyGraph, countDependents } from './dependency-graph.js';

describe('buildDependencyGraph', () => {
  it('resolves relative imports without an extension', () => {
    const graph = buildDependencyGraph([
      { path: 'src/a.ts', content: `import { b } from './b';` },
      { path: 'src/b.ts', content: 'export const b = 1;' },
    ]);

    expect(graph.edges.get('src/a.ts')).toEqual(new Set(['src/b.ts']));
  });

  it('resolves relative imports that use an explicit .js extension (NodeNext style)', () => {
    const graph = buildDependencyGraph([
      { path: 'src/a.ts', content: `import { b } from './b.js';` },
      { path: 'src/b.ts', content: 'export const b = 1;' },
    ]);

    expect(graph.edges.get('src/a.ts')).toEqual(new Set(['src/b.ts']));
  });

  it('resolves imports of a directory to its index file', () => {
    const graph = buildDependencyGraph([
      { path: 'src/a.ts', content: `import { b } from './lib/index.js';` },
      { path: 'src/lib/index.ts', content: 'export const b = 1;' },
    ]);

    expect(graph.edges.get('src/a.ts')).toEqual(new Set(['src/lib/index.ts']));
  });

  it('resolves parent-directory specifiers', () => {
    const graph = buildDependencyGraph([
      { path: 'src/nested/a.ts', content: `import { b } from '../b.js';` },
      { path: 'src/b.ts', content: 'export const b = 1;' },
    ]);

    expect(graph.edges.get('src/nested/a.ts')).toEqual(new Set(['src/b.ts']));
  });

  it('resolves require() calls', () => {
    const graph = buildDependencyGraph([
      { path: 'src/a.ts', content: `const b = require('./b');` },
      { path: 'src/b.ts', content: 'module.exports = 1;' },
    ]);

    expect(graph.edges.get('src/a.ts')).toEqual(new Set(['src/b.ts']));
  });

  it('ignores bare package specifiers', () => {
    const graph = buildDependencyGraph([
      { path: 'src/a.ts', content: `import { Command } from 'commander';` },
    ]);

    expect(graph.edges.get('src/a.ts')).toEqual(new Set());
  });

  it('ignores relative imports that do not resolve to a known file', () => {
    const graph = buildDependencyGraph([
      { path: 'src/a.ts', content: `import { missing } from './missing.js';` },
    ]);

    expect(graph.edges.get('src/a.ts')).toEqual(new Set());
  });
});

describe('countDependents', () => {
  it('counts how many other files import the target', () => {
    const graph = buildDependencyGraph([
      { path: 'src/a.ts', content: `import { shared } from './shared.js';` },
      { path: 'src/b.ts', content: `import { shared } from './shared.js';` },
      { path: 'src/shared.ts', content: 'export const shared = 1;' },
    ]);

    expect(countDependents(graph, 'src/shared.ts')).toBe(2);
    expect(countDependents(graph, 'src/a.ts')).toBe(0);
  });

  it('does not count a file as its own dependent', () => {
    const graph = buildDependencyGraph([{ path: 'src/a.ts', content: '' }]);
    expect(countDependents(graph, 'src/a.ts')).toBe(0);
  });
});
