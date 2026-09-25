import { getPullRequestDiff, type GetPullRequestDiffOptions } from './git/git-diff.js';
import { computeRiskAssessment } from './scoring/composite-scorer.js';
import { scoreChangeSize } from './scoring/change-size.js';
import type { PullRequestDiff, RiskAssessment } from './types/index.js';

export interface AnalysisResult {
  diff: PullRequestDiff;
  assessment: RiskAssessment;
}

/**
 * Fetches the diff for the given refs and runs every available risk factor
 * against it. Phase 1 ships change-size only; blast-radius and test-coverage
 * factors join this list in later phases.
 */
export async function analyze(options: GetPullRequestDiffOptions): Promise<AnalysisResult> {
  const diff = await getPullRequestDiff(options);
  const assessment = computeRiskAssessment([scoreChangeSize(diff.files)]);
  return { diff, assessment };
}
