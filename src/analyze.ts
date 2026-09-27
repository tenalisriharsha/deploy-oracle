import { readCoverageSummary } from './fs/coverage-report.js';
import { scanRepoFiles } from './fs/repo-scanner.js';
import { getPullRequestDiff, type GetPullRequestDiffOptions } from './git/git-diff.js';
import { recommendRollout } from './rollout/recommend-rollout.js';
import { scoreBlastRadius } from './scoring/blast-radius.js';
import { computeRiskAssessment } from './scoring/composite-scorer.js';
import { scoreChangeSize } from './scoring/change-size.js';
import { buildDependencyGraph } from './scoring/dependency-graph.js';
import { scoreTestCoverageDelta } from './scoring/test-coverage.js';
import type { PullRequestDiff, RiskAssessment, RolloutStrategy } from './types/index.js';

export interface AnalysisResult {
  diff: PullRequestDiff;
  assessment: RiskAssessment;
  rollout: RolloutStrategy;
}

/**
 * Fetches the diff for the given refs, scans the working tree for context
 * (local import graph, existing test files, a coverage report if present),
 * and runs every risk factor against the result.
 */
export async function analyze(options: GetPullRequestDiffOptions): Promise<AnalysisResult> {
  const cwd = options.cwd ?? process.cwd();

  const [diff, repoFiles, coverage] = await Promise.all([
    getPullRequestDiff(options),
    scanRepoFiles(cwd),
    readCoverageSummary(cwd),
  ]);

  const graph = buildDependencyGraph(repoFiles);

  const assessment = computeRiskAssessment([
    scoreChangeSize(diff.files),
    scoreBlastRadius(diff.files, graph),
    scoreTestCoverageDelta(
      diff.files,
      repoFiles.map((file) => file.path),
      coverage,
    ),
  ]);

  const rollout = recommendRollout(assessment);

  return { diff, assessment, rollout };
}
