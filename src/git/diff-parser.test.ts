import { describe, expect, it } from 'vitest';
import { mergeFileChanges, parseNameStatus, parseNumstat } from './diff-parser.js';

describe('parseNumstat', () => {
  it('parses added/deleted line counts per file', () => {
    const output = '12\t4\tsrc/foo.ts\n3\t0\tsrc/bar.ts\n';
    const result = parseNumstat(output);

    expect(result.get('src/foo.ts')).toEqual({ additions: 12, deletions: 4, binary: false });
    expect(result.get('src/bar.ts')).toEqual({ additions: 3, deletions: 0, binary: false });
  });

  it('marks binary files and zeroes their line counts', () => {
    const output = '-\t-\tassets/logo.png\n';
    const result = parseNumstat(output);

    expect(result.get('assets/logo.png')).toEqual({ additions: 0, deletions: 0, binary: true });
  });

  it('ignores blank lines', () => {
    const output = '\n1\t1\ta.ts\n\n';
    const result = parseNumstat(output);

    expect(result.size).toBe(1);
  });

  it('returns an empty map for empty input', () => {
    expect(parseNumstat('').size).toBe(0);
  });
});

describe('parseNameStatus', () => {
  it('maps status codes to change statuses', () => {
    const output = 'A\tsrc/new.ts\nM\tsrc/edited.ts\nD\tsrc/removed.ts\n';
    const result = parseNameStatus(output);

    expect(result.get('src/new.ts')).toBe('added');
    expect(result.get('src/edited.ts')).toBe('modified');
    expect(result.get('src/removed.ts')).toBe('deleted');
  });

  it('falls back to unknown for unrecognized status codes', () => {
    const output = 'T\tsrc/type-changed.ts\n';
    const result = parseNameStatus(output);

    expect(result.get('src/type-changed.ts')).toBe('unknown');
  });

  it('returns an empty map for empty input', () => {
    expect(parseNameStatus('').size).toBe(0);
  });
});

describe('mergeFileChanges', () => {
  it('combines numstat and name-status entries by path', () => {
    const numstat = parseNumstat('10\t2\tsrc/a.ts\n');
    const nameStatus = parseNameStatus('M\tsrc/a.ts\n');

    const result = mergeFileChanges(numstat, nameStatus);

    expect(result).toEqual([
      { path: 'src/a.ts', status: 'modified', additions: 10, deletions: 2, binary: false },
    ]);
  });

  it('produces sorted output for multiple files', () => {
    const numstat = parseNumstat('1\t1\tz.ts\n2\t2\ta.ts\n');
    const nameStatus = parseNameStatus('M\tz.ts\nM\ta.ts\n');

    const result = mergeFileChanges(numstat, nameStatus);

    expect(result.map((f) => f.path)).toEqual(['a.ts', 'z.ts']);
  });

  it('defaults missing fields when a path appears in only one source', () => {
    const numstat = parseNumstat('5\t0\tsrc/only-numstat.ts\n');
    const nameStatus = new Map<string, 'added'>();

    const result = mergeFileChanges(numstat, nameStatus);

    expect(result).toEqual([
      {
        path: 'src/only-numstat.ts',
        status: 'unknown',
        additions: 5,
        deletions: 0,
        binary: false,
      },
    ]);
  });
});
