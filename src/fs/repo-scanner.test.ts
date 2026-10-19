import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanRepoFiles, scanRepoFilesAtRef } from './repo-scanner.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd });
}

describe('scanRepoFiles', () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'deploy-oracle-scan-'));
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it('reads source files recursively as posix-style relative paths', async () => {
    await mkdir(join(rootDir, 'src', 'nested'), { recursive: true });
    await writeFile(join(rootDir, 'src', 'a.ts'), 'export const a = 1;');
    await writeFile(join(rootDir, 'src', 'nested', 'b.ts'), 'export const b = 2;');

    const files = await scanRepoFiles(rootDir);
    const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));

    expect(byPath['src/a.ts']).toBe('export const a = 1;');
    expect(byPath['src/nested/b.ts']).toBe('export const b = 2;');
  });

  it('ignores non-source files', async () => {
    await mkdir(join(rootDir, 'src'), { recursive: true });
    await writeFile(join(rootDir, 'src', 'notes.md'), '# notes');
    await writeFile(join(rootDir, 'src', 'a.ts'), 'export const a = 1;');

    const files = await scanRepoFiles(rootDir);

    expect(files.map((f) => f.path)).toEqual(['src/a.ts']);
  });

  it('ignores node_modules, dist, build, coverage, and dotfiles', async () => {
    await mkdir(join(rootDir, 'node_modules', 'pkg'), { recursive: true });
    await mkdir(join(rootDir, 'dist'), { recursive: true });
    await mkdir(join(rootDir, '.git'), { recursive: true });
    await writeFile(join(rootDir, 'node_modules', 'pkg', 'index.js'), '');
    await writeFile(join(rootDir, 'dist', 'out.js'), '');
    await writeFile(join(rootDir, '.git', 'config.js'), '');
    await writeFile(join(rootDir, 'kept.ts'), 'export {};');

    const files = await scanRepoFiles(rootDir);

    expect(files.map((f) => f.path)).toEqual(['kept.ts']);
  });

  it('returns an empty array for a directory with no source files', async () => {
    const files = await scanRepoFiles(rootDir);
    expect(files).toEqual([]);
  });
});

describe('scanRepoFilesAtRef', () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), 'deploy-oracle-scan-ref-'));
    await git(repoDir, ['init', '-q']);
    await git(repoDir, ['config', 'user.email', 'test@example.com']);
    await git(repoDir, ['config', 'user.name', 'Test']);
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  it('reads source files from the given ref, not the working tree', async () => {
    await mkdir(join(repoDir, 'src'), { recursive: true });
    await writeFile(join(repoDir, 'src', 'a.ts'), 'export const a = 1;');
    await git(repoDir, ['add', '.']);
    await git(repoDir, ['commit', '-q', '-m', 'commit at ref']);
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoDir });
    const ref = stdout.trim();

    // Change the working tree after the commit: the ref content must win.
    await writeFile(join(repoDir, 'src', 'a.ts'), 'export const a = 2; // uncommitted');
    await writeFile(join(repoDir, 'src', 'b.ts'), 'export const b = 1;');

    const files = await scanRepoFilesAtRef(repoDir, ref);
    const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));

    expect(byPath['src/a.ts']).toBe('export const a = 1;');
    expect(byPath['src/b.ts']).toBeUndefined();
  });

  it('ignores non-source files and ignored directories, like scanRepoFiles', async () => {
    await mkdir(join(repoDir, 'src'), { recursive: true });
    await mkdir(join(repoDir, 'dist'), { recursive: true });
    await writeFile(join(repoDir, 'src', 'notes.md'), '# notes');
    await writeFile(join(repoDir, 'src', 'a.ts'), 'export const a = 1;');
    await writeFile(join(repoDir, 'dist', 'out.js'), '');
    await git(repoDir, ['add', '.']);
    await git(repoDir, ['commit', '-q', '-m', 'commit']);

    const files = await scanRepoFilesAtRef(repoDir, 'HEAD');

    expect(files.map((f) => f.path)).toEqual(['src/a.ts']);
  });
});
