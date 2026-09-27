import type { AnalysisResult } from '../analyze.js';

const LEVEL_LABEL: Record<string, string> = {
  low: 'LOW',
  medium: 'MEDIUM',
  high: 'HIGH',
  critical: 'CRITICAL',
};

/**
 * Renders an analysis result as a plain-text report for the terminal.
 */
export function formatReport(result: AnalysisResult): string {
  const { diff, assessment, rollout } = result;
  const lines: string[] = [];

  lines.push(`Deploy Oracle risk report (${diff.base} -> ${diff.head})`);
  lines.push(`Risk score: ${assessment.score}/100 (${LEVEL_LABEL[assessment.level]})`);
  lines.push('');
  lines.push('Factors:');

  for (const factor of assessment.factors) {
    lines.push(`  - ${factor.label}: ${factor.score}/100 — ${factor.detail}`);
  }

  if (diff.files.length === 0) {
    lines.push('');
    lines.push('No file changes detected.');
  }

  lines.push('');
  lines.push('Rollout strategy:');
  lines.push(
    `  Canary: ${rollout.skipCanary ? 'skip canary, full rollout' : `${rollout.canaryPercentage}% first`}`,
  );
  lines.push('  Monitor:');
  for (const area of rollout.monitoringFocusAreas) {
    lines.push(`    - ${area}`);
  }
  lines.push(`  Rollback: ${rollout.rollbackPlan}`);

  return lines.join('\n');
}
