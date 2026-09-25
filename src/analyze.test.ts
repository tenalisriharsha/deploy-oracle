import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
    expect(result.assessment.factors.map((f) => f.id)).toContain('change-size');
  });

  it('produces a higher score for a larger change', async () => {
    const bigContent = Array.from({ length: 1500 }, (_, i) => `line ${i}`).join('\n');
    await writeFile(join(repoDir, 'a.txt'), bigContent);

    const result = await analyze({ base: 'HEAD', cwd: repoDir });

    expect(result.assessment.score).toBeGreaterThan(50);
  });
});
