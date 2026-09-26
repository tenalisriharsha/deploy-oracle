import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { SourceFile } from '../scoring/dependency-graph.js';

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
