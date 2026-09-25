import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PullRequestDiff } from '../types/index.js';
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

  return {
    base: options.base,
    head: options.head ?? 'working-tree',
    files,
  };
}
