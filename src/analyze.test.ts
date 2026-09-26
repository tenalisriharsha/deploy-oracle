import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analyze } from './analyze.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd });
}

describe('analyze', () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), 'deploy-oracle-analyze-'));
    await git(repoDir, ['init', '-q']);
    await git(repoDir, ['config', 'user.email', 'test@example.com']);
    await git(repoDir, ['config', 'user.name', 'Test']);
    await writeFile(join(repoDir, 'a.txt'), 'hello\n');
    await git(repoDir, ['add', '.']);
    await git(repoDir, ['commit', '-q', '-m', 'initial commit']);
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  it('produces a low-risk assessment for a small change', async () => {
    await writeFile(join(repoDir, 'a.txt'), 'hello\nworld\n');

    const result = await analyze({ base: 'HEAD', cwd: repoDir });

    expect(result.diff.files).toHaveLength(1);
    expect(result.assessment.level).toBe('low');
    expect(result.assessment.factors.map((f) => f.id)).toEqual([
      'change-size',
      'blast-radius',
      'test-coverage',
    ]);
  });

  it('produces a higher change-size score for a larger change', async () => {
    const bigContent = Array.from({ length: 1500 }, (_, i) => `line ${i}`).join('\n');
    await writeFile(join(repoDir, 'a.txt'), bigContent);

    const result = await analyze({ base: 'HEAD', cwd: repoDir });
    const changeSize = result.assessment.factors.find((f) => f.id === 'change-size');

    expect(changeSize?.score).toBe(100);
  });

  it('flags a new source file with no test as a high test-coverage risk', async () => {
    await mkdir(join(repoDir, 'src'), { recursive: true });
    await writeFile(join(repoDir, 'src', 'widget.ts'), 'export const widget = 1;\n');
    await git(repoDir, ['add', '.']);

    const result = await analyze({ base: 'HEAD', cwd: repoDir });
    const coverage = result.assessment.factors.find((f) => f.id === 'test-coverage');

    expect(coverage?.score).toBe(100);
  });

  it('does not penalize a new source file that ships alongside its test', async () => {
    await mkdir(join(repoDir, 'src'), { recursive: true });
    await writeFile(join(repoDir, 'src', 'widget.ts'), 'export const widget = 1;\n');
    await writeFile(join(repoDir, 'src', 'widget.test.ts'), 'test.todo("widget");\n');
    await git(repoDir, ['add', '.']);

    const result = await analyze({ base: 'HEAD', cwd: repoDir });
    const coverage = result.assessment.factors.find((f) => f.id === 'test-coverage');

    expect(coverage?.score).toBe(0);
  });

  it('flags a change to a file on a critical path regardless of its dependents', async () => {
    await mkdir(join(repoDir, 'src', 'auth'), { recursive: true });
    await writeFile(join(repoDir, 'src', 'auth', 'login.ts'), 'export const login = () => {};\n');
    await git(repoDir, ['add', '.']);

    const result = await analyze({ base: 'HEAD', cwd: repoDir });
    const blastRadius = result.assessment.factors.find((f) => f.id === 'blast-radius');

    expect(blastRadius?.score).toBe(100);
  });
});
