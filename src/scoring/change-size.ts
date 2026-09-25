import type { FileChange, RiskFactor } from '../types/index.js';

export interface ChangeSizeThresholds {
  /** File count at or above which the file-count score saturates at 100. */
  maxFiles: number;
  /** Line count (additions + deletions) at or above which the line score saturates at 100. */
  maxLines: number;
}

export const DEFAULT_CHANGE_SIZE_THRESHOLDS: ChangeSizeThresholds = {
  maxFiles: 30,
  maxLines: 1000,
};

/**
 * Scores risk from the sheer size of a change: more files and more churned
 * lines are harder to review carefully and more likely to hide a mistake.
 * Uses whichever of file-count or line-count is proportionally larger, since
 * either alone can indicate a large blast radius.
 */
export function scoreChangeSize(
  files: FileChange[],
  thresholds: ChangeSizeThresholds = DEFAULT_CHANGE_SIZE_THRESHOLDS,
): RiskFactor {
  const fileCount = files.length;
  const totalLines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);

  const fileScore = toScore(fileCount, thresholds.maxFiles);
  const lineScore = toScore(totalLines, thresholds.maxLines);
  const score = Math.round(Math.max(fileScore, lineScore));

  return {
    id: 'change-size',
    label: 'Change size',
    score,
    weight: 1,
    detail: `${fileCount} file${fileCount === 1 ? '' : 's'} changed, ${totalLines} line${totalLines === 1 ? '' : 's'} touched`,
  };
}

function toScore(value: number, saturatesAt: number): number {
  if (saturatesAt <= 0) return 0;
  return Math.min(100, (value / saturatesAt) * 100);
}
