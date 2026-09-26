import { describe, expect, it } from 'vitest';
import type { FileChange } from '../types/index.js';
import { scoreTestCoverageDelta } from './test-coverage.js';

function file(overrides: Partial<FileChange> = {}): FileChange {
  return {
    path: 'src/widget.ts',
    status: 'modified',
    additions: 1,
    deletions: 0,
    binary: false,
    ...overrides,
  };
}

describe('scoreTestCoverageDelta', () => {
  it('scores zero when no source files changed', () => {
    const factor = scoreTestCoverageDelta([file({ path: 'README.md' })], []);
    expect(factor.score).toBe(0);
    expect(factor.detail).toBe('no source files changed');
  });

  it('scores zero when the matching test file was changed alongside the source', () => {
    const factor = scoreTestCoverageDelta(
      [file({ path: 'src/widget.ts' }), file({ path: 'src/widget.test.ts' })],
      [],
    );

    expect(factor.score).toBe(0);
    expect(factor.detail).toContain('matching test updates');
  });

  it('scores 100 when there is no test file for the changed source at all', () => {
    const factor = scoreTestCoverageDelta([file({ path: 'src/widget.ts' })], []);

    expect(factor.score).toBe(100);
    expect(factor.detail).toContain('1/1 changed file');
    expect(factor.detail).toContain('src/widget.ts');
  });

  it('scores 50 when an existing test file was not updated alongside the source', () => {
    const factor = scoreTestCoverageDelta(
      [file({ path: 'src/widget.ts' })],
      ['src/widget.test.ts'],
    );

    expect(factor.score).toBe(50);
    expect(factor.detail).toContain("existing test that wasn't updated");
  });

  it('ignores deleted files', () => {
    const factor = scoreTestCoverageDelta([file({ path: 'src/widget.ts', status: 'deleted' })], []);
    expect(factor.score).toBe(0);
    expect(factor.detail).toBe('no source files changed');
  });

  it('treats an existing test with low reported coverage as uncovered', () => {
    const factor = scoreTestCoverageDelta(
      [file({ path: 'src/widget.ts' })],
      ['src/widget.test.ts'],
      { 'src/widget.ts': { linesPct: 10 } },
      { lowCoverageThreshold: 50 },
    );

    expect(factor.score).toBe(100);
  });

  it('does not penalize an existing test with acceptable reported coverage', () => {
    const factor = scoreTestCoverageDelta(
      [file({ path: 'src/widget.ts' })],
      ['src/widget.test.ts'],
      { 'src/widget.ts': { linesPct: 90 } },
      { lowCoverageThreshold: 50 },
    );

    expect(factor.score).toBe(50);
  });

  it('averages risk across multiple changed source files', () => {
    const factor = scoreTestCoverageDelta(
      [file({ path: 'src/a.ts' }), file({ path: 'src/b.ts' }), file({ path: 'src/c.test.ts' })],
      ['src/b.test.ts'],
    );

    // a.ts: no test at all -> 100; b.ts: existing test, not updated -> 50
    expect(factor.score).toBe(75);
  });
});
