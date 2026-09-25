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
  const { diff, assessment } = result;
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

  return lines.join('\n');
}
