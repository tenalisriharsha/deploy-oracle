import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readCoverageSummary, readCoverageSummaryAtRef } from './coverage-report.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd });
}

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

describe('readCoverageSummaryAtRef', () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), 'deploy-oracle-coverage-ref-'));
    await git(repoDir, ['init', '-q']);
    await git(repoDir, ['config', 'user.email', 'test@example.com']);
    await git(repoDir, ['config', 'user.name', 'Test']);
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  it('reads the summary committed at the given ref, not the working tree', async () => {
    await mkdir(join(repoDir, 'coverage'), { recursive: true });
    await writeFile(
      join(repoDir, 'coverage', 'coverage-summary.json'),
      JSON.stringify({ 'src/a.ts': { lines: { pct: 87.5 } } }),
    );
    await git(repoDir, ['add', '.']);
    await git(repoDir, ['commit', '-q', '-m', 'commit coverage']);
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoDir });
    const ref = stdout.trim();

    await writeFile(
      join(repoDir, 'coverage', 'coverage-summary.json'),
      JSON.stringify({ 'src/a.ts': { lines: { pct: 10 } } }),
    );

    const summary = await readCoverageSummaryAtRef(repoDir, ref);

    expect(summary).toEqual({ 'src/a.ts': { linesPct: 87.5 } });
  });

  it('returns undefined when no coverage report exists at the ref', async () => {
    await writeFile(join(repoDir, 'placeholder.txt'), 'x');
    await git(repoDir, ['add', '.']);
    await git(repoDir, ['commit', '-q', '-m', 'no coverage report']);

    expect(await readCoverageSummaryAtRef(repoDir, 'HEAD')).toBeUndefined();
  });
});
