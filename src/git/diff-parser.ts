import type { ChangeStatus, FileChange } from '../types/index.js';

interface NumstatEntry {
  additions: number;
  deletions: number;
  binary: boolean;
}

/**
 * Parses the output of `git diff --no-renames --numstat`.
 * Each line is "<additions>\t<deletions>\t<path>", or "-\t-\t<path>" for binary files.
 */
export function parseNumstat(output: string): Map<string, NumstatEntry> {
  const entries = new Map<string, NumstatEntry>();

  for (const line of splitLines(output)) {
    const [rawAdditions, rawDeletions, path] = line.split('\t');
    if (!path) continue;

    const binary = rawAdditions === '-' || rawDeletions === '-';
    entries.set(path, {
      additions: binary ? 0 : Number(rawAdditions),
      deletions: binary ? 0 : Number(rawDeletions),
      binary,
    });
  }

  return entries;
}

const STATUS_CODES: Record<string, ChangeStatus> = {
  A: 'added',
  M: 'modified',
  D: 'deleted',
};

/**
 * Parses the output of `git diff --no-renames --name-status`.
 * Each line is "<statusCode>\t<path>".
 */
export function parseNameStatus(output: string): Map<string, ChangeStatus> {
  const statuses = new Map<string, ChangeStatus>();

  for (const line of splitLines(output)) {
    const [code, path] = line.split('\t');
    if (!path || !code) continue;
    statuses.set(path, STATUS_CODES[code] ?? 'unknown');
  }

  return statuses;
}

/**
 * Merges numstat and name-status output into a unified list of file changes.
 */
export function mergeFileChanges(
  numstat: Map<string, NumstatEntry>,
  nameStatus: Map<string, ChangeStatus>,
): FileChange[] {
  const paths = new Set([...numstat.keys(), ...nameStatus.keys()]);

  return [...paths]
    .sort()
    .map((path) => {
      const stat = numstat.get(path);
      return {
        path,
        status: nameStatus.get(path) ?? 'unknown',
        additions: stat?.additions ?? 0,
        deletions: stat?.deletions ?? 0,
        binary: stat?.binary ?? false,
      };
    });
}

function splitLines(output: string): string[] {
  return output.split('\n').filter((line) => line.trim().length > 0);
}
