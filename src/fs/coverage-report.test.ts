import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readCoverageSummary } from './coverage-report.js';

describe('readCoverageSummary', () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'deploy-oracle-coverage-'));
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it('returns undefined when no coverage report exists', async () => {
    expect(await readCoverageSummary(rootDir)).toBeUndefined();
  });

  it('returns undefined when the report is not valid JSON', async () => {
    await mkdir(join(rootDir, 'coverage'), { recursive: true });
    await writeFile(join(rootDir, 'coverage', 'coverage-summary.json'), 'not json');

    expect(await readCoverageSummary(rootDir)).toBeUndefined();
  });

  it('parses relative-path entries and skips the total entry', async () => {
    await mkdir(join(rootDir, 'coverage'), { recursive: true });
    await writeFile(
      join(rootDir, 'coverage', 'coverage-summary.json'),
      JSON.stringify({
        total: { lines: { pct: 42 } },
        'src/a.ts': { lines: { pct: 87.5 } },
      }),
    );

    const summary = await readCoverageSummary(rootDir);

    expect(summary).toEqual({ 'src/a.ts': { linesPct: 87.5 } });
  });

  it('normalizes absolute-path keys to repo-relative posix paths', async () => {
    await mkdir(join(rootDir, 'coverage'), { recursive: true });
    const absoluteKey = join(rootDir, 'src', 'a.ts');
    await writeFile(
      join(rootDir, 'coverage', 'coverage-summary.json'),
      JSON.stringify({ [absoluteKey]: { lines: { pct: 60 } } }),
    );

    const summary = await readCoverageSummary(rootDir);

    expect(summary).toEqual({ 'src/a.ts': { linesPct: 60 } });
  });

  it('reads from a custom summary path', async () => {
    await mkdir(join(rootDir, 'custom-coverage'), { recursive: true });
    await writeFile(
      join(rootDir, 'custom-coverage', 'summary.json'),
      JSON.stringify({ 'src/a.ts': { lines: { pct: 100 } } }),
    );

    const summary = await readCoverageSummary(rootDir, 'custom-coverage/summary.json');

    expect(summary).toEqual({ 'src/a.ts': { linesPct: 100 } });
  });
});
