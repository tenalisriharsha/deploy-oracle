import { describe, expect, it } from 'vitest';
import type { FileChange } from '../types/index.js';
import { scoreChangeSize } from './change-size.js';

function file(overrides: Partial<FileChange> = {}): FileChange {
  return {
    path: 'src/file.ts',
    status: 'modified',
    additions: 0,
    deletions: 0,
    binary: false,
    ...overrides,
  };
}

describe('scoreChangeSize', () => {
  it('scores an empty change as zero risk', () => {
    const factor = scoreChangeSize([]);
    expect(factor.score).toBe(0);
    expect(factor.detail).toContain('0 files changed');
  });

  it('scores a small change as low risk', () => {
    const factor = scoreChangeSize([file({ additions: 5, deletions: 1 })]);
    expect(factor.score).toBeLessThan(25);
  });

  it('saturates at 100 for changes at or beyond the file-count threshold', () => {
    const files = Array.from({ length: 40 }, (_, i) => file({ path: `src/f${i}.ts` }));
    const factor = scoreChangeSize(files, { maxFiles: 30, maxLines: 1000 });
    expect(factor.score).toBe(100);
  });

  it('saturates at 100 for changes at or beyond the line-count threshold', () => {
    const factor = scoreChangeSize([file({ additions: 2000, deletions: 0 })], {
      maxFiles: 30,
      maxLines: 1000,
    });
    expect(factor.score).toBe(100);
  });

  it('uses whichever dimension (files or lines) is proportionally larger', () => {
    // 5 files out of 10 max (50%) vs 10 lines out of 1000 max (1%) -> file score wins.
    const files = Array.from({ length: 5 }, (_, i) =>
      file({ path: `src/f${i}.ts`, additions: 2 }),
    );
    const factor = scoreChangeSize(files, { maxFiles: 10, maxLines: 1000 });
    expect(factor.score).toBe(50);
  });

  it('reports the file and line counts in the detail message', () => {
    const factor = scoreChangeSize([file({ additions: 3, deletions: 2 })]);
    expect(factor.detail).toBe('1 file changed, 5 lines touched');
  });
});
