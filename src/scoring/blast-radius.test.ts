import { describe, expect, it } from 'vitest';
import type { FileChange } from '../types/index.js';
import { buildDependencyGraph } from './dependency-graph.js';
import { scoreBlastRadius } from './blast-radius.js';

function file(overrides: Partial<FileChange> = {}): FileChange {
  return {
    path: 'src/file.ts',
    status: 'modified',
    additions: 1,
    deletions: 0,
    binary: false,
    ...overrides,
  };
}

describe('scoreBlastRadius', () => {
  it('scores zero risk when the changed file has no dependents and matches no critical path', () => {
    const graph = buildDependencyGraph([{ path: 'src/leaf.ts', content: '' }]);
    const factor = scoreBlastRadius([file({ path: 'src/leaf.ts' })], graph);

    expect(factor.score).toBe(0);
    expect(factor.detail).toContain('no internal dependents');
  });

  it('scores proportionally to the largest number of dependents among changed files', () => {
    const graph = buildDependencyGraph([
      { path: 'src/a.ts', content: `import './shared.js';` },
      { path: 'src/b.ts', content: `import './shared.js';` },
      { path: 'src/c.ts', content: `import './shared.js';` },
      { path: 'src/shared.ts', content: '' },
    ]);

    const factor = scoreBlastRadius([file({ path: 'src/shared.ts' })], graph, {
      criticalPathGlobs: [],
      maxDependents: 6,
    });

    expect(factor.score).toBe(50);
    expect(factor.detail).toContain('src/shared.ts has 3 known dependents');
  });

  it('saturates at 100 once dependents reach the configured threshold', () => {
    const graph = buildDependencyGraph([
      { path: 'src/a.ts', content: `import './shared.js';` },
      { path: 'src/b.ts', content: `import './shared.js';` },
      { path: 'src/shared.ts', content: '' },
    ]);

    const factor = scoreBlastRadius([file({ path: 'src/shared.ts' })], graph, {
      criticalPathGlobs: [],
      maxDependents: 2,
    });

    expect(factor.score).toBe(100);
  });

  it('scores 100 when a changed file matches a critical-path glob, regardless of dependents', () => {
    const graph = buildDependencyGraph([{ path: 'src/auth/login.ts', content: '' }]);
    const factor = scoreBlastRadius([file({ path: 'src/auth/login.ts' })], graph, {
      criticalPathGlobs: ['**/auth/**'],
      maxDependents: 15,
    });

    expect(factor.score).toBe(100);
    expect(factor.detail).toContain('touches critical path: src/auth/login.ts');
  });
});
