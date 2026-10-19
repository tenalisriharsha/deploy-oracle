import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { SourceFile } from '../scoring/dependency-graph.js';

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 1024 * 1024 * 20;

const IGNORED_DIR_NAMES = new Set(['node_modules', 'dist', 'build', 'coverage']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

/**
 * Recursively reads every source file under `rootDir` into memory, for
 * static analysis (dependency graph, existing-test lookups). Skips
 * dependency/build/VCS directories. Unreadable entries are silently
 * skipped rather than failing the whole scan.
 */
export async function scanRepoFiles(rootDir: string): Promise<SourceFile[]> {
  const results: SourceFile[] = [];
  await walk(rootDir, rootDir, results);
  return results;
}

/**
 * Same as {@link scanRepoFiles}, but reads the committed tree at `ref`
 * (via `git ls-tree` and `git show`) instead of the working checkout, so
 * the result doesn't depend on what happens to be on disk in `cwd`.
 */
export async function scanRepoFilesAtRef(cwd: string, ref: string): Promise<SourceFile[]> {
  const { stdout } = await execFileAsync('git', ['ls-tree', '-r', '-z', '--name-only', ref, '--'], {
    cwd,
    maxBuffer: MAX_BUFFER,
  });

  const paths = stdout.split('\0').filter((entry) => entry.length > 0 && isIncludedPath(entry));

  const files = await Promise.all(
    paths.map(async (relPath): Promise<SourceFile | undefined> => {
      try {
        const { stdout: content } = await execFileAsync('git', ['show', `${ref}:${relPath}`], {
          cwd,
          maxBuffer: MAX_BUFFER,
          encoding: 'utf8',
        });
        return { path: relPath, content };
      } catch {
        return undefined;
      }
    }),
  );

  return files.filter((file): file is SourceFile => file !== undefined);
}

function isIncludedPath(relPath: string): boolean {
  const segments = relPath.split('/');
  const fileName = segments.pop() ?? '';
  for (const segment of segments) {
    if (segment.startsWith('.') || IGNORED_DIR_NAMES.has(segment)) return false;
  }
  return SOURCE_EXTENSIONS.has(path.extname(fileName));
}

async function walk(rootDir: string, currentDir: string, results: SourceFile[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || IGNORED_DIR_NAMES.has(entry.name)) continue;
      await walk(rootDir, path.join(currentDir, entry.name), results);
      continue;
    }

    if (!entry.isFile() || !SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;

    const absolutePath = path.join(currentDir, entry.name);
    try {
      const content = await readFile(absolutePath, 'utf8');
      results.push({ path: toPosixRelative(rootDir, absolutePath), content });
    } catch {
      continue;
    }
  }
}

function toPosixRelative(rootDir: string, absolutePath: string): string {
  return path.relative(rootDir, absolutePath).split(path.sep).join('/');
}
