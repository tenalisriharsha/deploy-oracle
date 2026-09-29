import { loadConfig, type DeployOracleConfig, type FactorWeights } from './config/load-config.js';
import { readCoverageSummary } from './fs/coverage-report.js';
import { scanRepoFiles } from './fs/repo-scanner.js';
import { getPullRequestDiff, type GetPullRequestDiffOptions } from './git/git-diff.js';
import { recommendRollout } from './rollout/recommend-rollout.js';
import { scoreBlastRadius } from './scoring/blast-radius.js';
import { computeRiskAssessment } from './scoring/composite-scorer.js';
import { scoreChangeSize } from './scoring/change-size.js';
import { buildDependencyGraph } from './scoring/dependency-graph.js';
import { scoreTestCoverageDelta } from './scoring/test-coverage.js';
import type { PullRequestDiff, RiskAssessment, RiskFactor, RolloutStrategy } from './types/index.js';

export interface AnalyzeOptions extends GetPullRequestDiffOptions {
  /** Pre-loaded config. Defaults to `loadConfig(cwd)` (reads `.deployoraclerc.json` if present). */
  config?: DeployOracleConfig;
}

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
export async function analyze(options: AnalyzeOptions): Promise<AnalysisResult> {
  const cwd = options.cwd ?? process.cwd();

  const [diff, repoFiles, coverage, config] = await Promise.all([
    getPullRequestDiff(options),
    scanRepoFiles(cwd),
    readCoverageSummary(cwd),
    options.config ? Promise.resolve(options.config) : loadConfig(cwd),
  ]);

  const graph = buildDependencyGraph(repoFiles);

  const assessment = computeRiskAssessment(
    [
      scoreChangeSize(diff.files, config.changeSize),
      scoreBlastRadius(diff.files, graph, config.blastRadius),
      scoreTestCoverageDelta(
        diff.files,
        repoFiles.map((file) => file.path),
        coverage,
        config.testCoverage,
      ),
    ].map((factor) => applyWeightOverride(factor, config.weights)),
  );

  const rollout = recommendRollout(assessment);

  return { diff, assessment, rollout };
}

function applyWeightOverride(factor: RiskFactor, weights: FactorWeights): RiskFactor {
  const override = weights[factor.id];
  return override === undefined ? factor : { ...factor, weight: override };
}
