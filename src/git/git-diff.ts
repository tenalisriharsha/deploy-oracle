import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { FileChange, PullRequestDiff } from '../types/index.js';
import { mergeFileChanges, parseNameStatus, parseNumstat } from './diff-parser.js';

const execFileAsync = promisify(execFile);

const MAX_BUFFER = 1024 * 1024 * 20;

export interface GetPullRequestDiffOptions {
  /** Ref to diff from, e.g. the PR's base branch. */
  base: string;
  /** Ref to diff to. Omit to diff against the working tree. */
  head?: string;
  /** Directory containing the git repository. Defaults to the current working directory. */
  cwd?: string;
}

async function runGitDiff(range: string, extraArgs: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['diff', '--no-renames', range, ...extraArgs],
      { cwd, maxBuffer: MAX_BUFFER },
    );
    return stdout;
  } catch (error) {
    const stderr = isExecFileError(error) ? error.stderr.trim().split('\n')[0] : undefined;
    throw new Error(stderr ? `git diff failed: ${stderr}` : `git diff failed for range "${range}"`);
  }
}

function isExecFileError(error: unknown): error is { stderr: string } {
  return typeof error === 'object' && error !== null && typeof (error as { stderr?: unknown }).stderr === 'string';
}

/**
 * Resolves the root directory of the git repository containing `cwd`. Used
 * to scan the working tree from the same path space `git diff` reports
 * (always repo-root-relative) regardless of which subdirectory a command
 * was invoked from.
 */
export async function getRepoRoot(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd });
    return stdout.trim();
  } catch (error) {
    const stderr = isExecFileError(error) ? error.stderr.trim().split('\n')[0] : undefined;
    throw new Error(stderr ? `git rev-parse failed: ${stderr}` : 'git rev-parse failed to resolve repository root');
  }
}

/**
 * Computes the file-level diff between two refs (or a ref and the working tree)
 * by shelling out to `git diff`. Renames are disabled so every file is
 * reported as a plain add/modify/delete, keeping downstream scoring simple.
 */
export async function getPullRequestDiff(
  options: GetPullRequestDiffOptions,
): Promise<PullRequestDiff> {
  const cwd = options.cwd ?? process.cwd();
  const range = options.head ? `${options.base}...${options.head}` : options.base;

  const [numstatOutput, nameStatusOutput] = await Promise.all([
    runGitDiff(range, ['--numstat'], cwd),
    runGitDiff(range, ['--name-status'], cwd),
  ]);

  const files = mergeFileChanges(parseNumstat(numstatOutput), parseNameStatus(nameStatusOutput));

  // `git diff` never reports untracked files, even against the working tree,
  // so pick them up separately and fold them in as additions.
  if (!options.head) {
    const repoRoot = await getRepoRoot(cwd);
    const untrackedPaths = await getUntrackedFiles(repoRoot);
    if (untrackedPaths.length > 0) {
      files.push(...(await Promise.all(untrackedPaths.map((path) => untrackedFileChange(repoRoot, path)))));
      files.sort((a, b) => a.path.localeCompare(b.path));
    }
  }

  return {
    base: options.base,
    head: options.head ?? 'working-tree',
    files,
  };
}

/**
 * Lists files that are present in the working tree but not tracked by git
 * and not excluded by .gitignore (mirrors what `git status` shows as "Untracked").
 */
async function getUntrackedFiles(repoRoot: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['ls-files', '--others', '--exclude-standard'],
      { cwd: repoRoot, maxBuffer: MAX_BUFFER },
    );
    return stdout.split('\n').filter((line) => line.length > 0);
  } catch (error) {
    const stderr = isExecFileError(error) ? error.stderr.trim().split('\n')[0] : undefined;
    throw new Error(stderr ? `git ls-files failed: ${stderr}` : 'git ls-files failed to list untracked files');
  }
}

/** Builds a FileChange for an untracked file by reading it directly, since it has no diff. */
async function untrackedFileChange(repoRoot: string, path: string): Promise<FileChange> {
  const content = await readFile(join(repoRoot, path));
  const binary = content.includes(0);
  return {
    path,
    status: 'added',
    additions: binary ? 0 : countLines(content.toString('utf8')),
    deletions: 0,
    binary,
  };
}

function countLines(content: string): number {
  if (content.length === 0) return 0;
  const lines = content.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.length;
}
