import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPullRequestDiff } from './git-diff.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd });
}

describe('getPullRequestDiff', () => {
  let repoDir: string;
  let defaultBranch: string;

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), 'deploy-oracle-'));
    await git(repoDir, ['init', '-q']);
    await git(repoDir, ['config', 'user.email', 'test@example.com']);
    await git(repoDir, ['config', 'user.name', 'Test']);

    await writeFile(join(repoDir, 'unchanged.txt'), 'a\nb\nc\n');
    await writeFile(join(repoDir, 'to-modify.txt'), 'line1\nline2\nline3\n');
    await writeFile(join(repoDir, 'to-delete.txt'), 'bye\n');
    await git(repoDir, ['add', '.']);
    await git(repoDir, ['commit', '-q', '-m', 'initial commit']);

    const { stdout } = await execFileAsync('git', ['branch', '--show-current'], { cwd: repoDir });
    defaultBranch = stdout.trim();
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  it('reports added, modified, and deleted files against the working tree', async () => {
    await writeFile(join(repoDir, 'to-modify.txt'), 'line1\nline2-changed\nline3\nline4\n');
    await writeFile(join(repoDir, 'new-file.txt'), 'brand new\n');
    await rm(join(repoDir, 'to-delete.txt'));
    await git(repoDir, ['add', '-A']);

    const diff = await getPullRequestDiff({ base: 'HEAD', cwd: repoDir });

    const byPath = Object.fromEntries(diff.files.map((f) => [f.path, f]));

    expect(byPath['new-file.txt']).toMatchObject({ status: 'added', additions: 1, deletions: 0 });
    expect(byPath['to-modify.txt']).toMatchObject({
      status: 'modified',
      additions: 2,
      deletions: 1,
    });
    expect(byPath['to-delete.txt']).toMatchObject({ status: 'deleted', additions: 0 });
    expect(byPath['unchanged.txt']).toBeUndefined();
  });

  it('diffs between two committed refs', async () => {
    await git(repoDir, ['checkout', '-q', '-b', 'feature']);
    await writeFile(join(repoDir, 'feature-file.txt'), 'feature work\n');
    await git(repoDir, ['add', '.']);
    await git(repoDir, ['commit', '-q', '-m', 'add feature file']);

    const diff = await getPullRequestDiff({ base: defaultBranch, head: 'feature', cwd: repoDir });

    expect(diff.files).toEqual([
      { path: 'feature-file.txt', status: 'added', additions: 1, deletions: 0, binary: false },
    ]);
  });

  it('returns no files when there are no changes', async () => {
    const diff = await getPullRequestDiff({ base: 'HEAD', cwd: repoDir });
    expect(diff.files).toEqual([]);
  });

  it('raises a concise error when the ref does not exist', async () => {
    await expect(getPullRequestDiff({ base: 'no-such-ref', cwd: repoDir })).rejects.toThrow(
      /git diff failed/,
    );
  });
});
