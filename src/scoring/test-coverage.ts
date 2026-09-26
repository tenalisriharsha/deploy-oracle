import type { FileChange, RiskFactor } from '../types/index.js';

export interface CoverageSummary {
  [path: string]: { linesPct: number };
}

export interface TestCoverageOptions {
  /** Line-coverage percentage below which an existing test is treated as stale/insufficient. */
  lowCoverageThreshold: number;
}

export const DEFAULT_TEST_COVERAGE_OPTIONS: TestCoverageOptions = {
  lowCoverageThreshold: 50,
};

const TEST_FILE_RE = /(\.(test|spec)\.[cm]?[jt]sx?$)|(^|\/)(tests?|__tests__)\//i;
const SOURCE_EXT_RE = /\.[cm]?[jt]sx?$/i;
const DECLARATION_FILE_RE = /\.d\.ts$/i;

function isTestFile(path: string): boolean {
  return TEST_FILE_RE.test(path);
}

function isSourceFile(path: string): boolean {
  return SOURCE_EXT_RE.test(path) && !DECLARATION_FILE_RE.test(path) && !isTestFile(path);
}

/** Filename with extension and test suffix stripped, used to correlate a source file with its test. */
function basenameKey(path: string): string {
  const base = path.split('/').pop() ?? path;
  return base.replace(SOURCE_EXT_RE, '').replace(/\.(test|spec)$/i, '');
}

/**
 * Scores risk from a mismatch between changed source files and test
 * movement: a source file changed with no corresponding test file changed
 * in the same diff, and no pre-existing test file at all, is the riskiest
 * case. A pre-existing but unchanged test is a middling risk — it exists,
 * but wasn't necessarily updated for this change. When a coverage report is
 * available, an existing test with low line coverage is treated the same as
 * having no test at all.
 */
export function scoreTestCoverageDelta(
  files: FileChange[],
  existingPaths: string[],
  coverage?: CoverageSummary,
  options: TestCoverageOptions = DEFAULT_TEST_COVERAGE_OPTIONS,
): RiskFactor {
  const changedSourceFiles = files.filter(
    (file) => file.status !== 'deleted' && isSourceFile(file.path),
  );

  if (changedSourceFiles.length === 0) {
    return {
      id: 'test-coverage',
      label: 'Test coverage delta',
      score: 0,
      weight: 1,
      detail: 'no source files changed',
    };
  }

  const changedTestKeys = new Set(
    files.filter((file) => isTestFile(file.path)).map((file) => basenameKey(file.path)),
  );
  const existingTestKeys = new Set(
    existingPaths.filter((path) => isTestFile(path)).map((path) => basenameKey(path)),
  );

  const uncoveredPaths: string[] = [];
  const stalePaths: string[] = [];

  for (const file of changedSourceFiles) {
    const key = basenameKey(file.path);
    if (changedTestKeys.has(key)) continue;

    const coveragePct = coverage?.[file.path]?.linesPct;
    const hasLowCoverage = coveragePct !== undefined && coveragePct < options.lowCoverageThreshold;

    if (!existingTestKeys.has(key) || hasLowCoverage) {
      uncoveredPaths.push(file.path);
    } else {
      stalePaths.push(file.path);
    }
  }

  const score = Math.min(
    100,
    Math.round((uncoveredPaths.length * 100 + stalePaths.length * 50) / changedSourceFiles.length),
  );

  const detailParts: string[] = [];
  if (uncoveredPaths.length > 0) {
    detailParts.push(
      `${uncoveredPaths.length}/${changedSourceFiles.length} changed file${changedSourceFiles.length === 1 ? '' : 's'} with no test coverage (${uncoveredPaths.join(', ')})`,
    );
  }
  if (stalePaths.length > 0) {
    detailParts.push(
      `${stalePaths.length} file${stalePaths.length === 1 ? '' : 's'} with an existing test that wasn't updated (${stalePaths.join(', ')})`,
    );
  }
  if (detailParts.length === 0) {
    detailParts.push(
      `all ${changedSourceFiles.length} changed source file${changedSourceFiles.length === 1 ? '' : 's'} have matching test updates`,
    );
  }

  return {
    id: 'test-coverage',
    label: 'Test coverage delta',
    score,
    weight: 1,
    detail: detailParts.join('; '),
  };
}
