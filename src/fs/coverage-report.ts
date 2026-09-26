import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CoverageSummary } from '../scoring/test-coverage.js';

const DEFAULT_COVERAGE_SUMMARY_PATH = 'coverage/coverage-summary.json';

/**
 * Reads an Istanbul-style `coverage-summary.json` if one exists at
 * `<rootDir>/<summaryPath>`, normalizing its (often absolute) keys to
 * repo-relative posix paths. Returns undefined if no report is present or
 * it can't be parsed — coverage data is an optional enhancement, not a
 * requirement, for the test-coverage risk factor.
 */
export async function readCoverageSummary(
  rootDir: string,
  summaryPath: string = DEFAULT_COVERAGE_SUMMARY_PATH,
): Promise<CoverageSummary | undefined> {
  let raw: string;
  try {
    raw = await readFile(path.join(rootDir, summaryPath), 'utf8');
  } catch {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (typeof parsed !== 'object' || parsed === null) return undefined;

  const summary: CoverageSummary = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (key === 'total') continue;

    const linesPct = extractLinesPct(value);
    if (linesPct === undefined) continue;

    const relativePath = path.isAbsolute(key) ? path.relative(rootDir, key) : key;
    summary[relativePath.split(path.sep).join('/')] = { linesPct };
  }

  return summary;
}

function extractLinesPct(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const lines = (value as Record<string, unknown>).lines;
  if (typeof lines !== 'object' || lines === null) return undefined;
  const pct = (lines as Record<string, unknown>).pct;
  return typeof pct === 'number' ? pct : undefined;
}
