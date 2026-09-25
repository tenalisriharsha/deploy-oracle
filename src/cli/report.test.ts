import { describe, expect, it } from 'vitest';
import type { AnalysisResult } from '../analyze.js';
import { formatReport } from './report.js';

function result(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    diff: { base: 'HEAD', head: 'working-tree', files: [] },
    assessment: { score: 0, level: 'low', factors: [] },
    ...overrides,
  };
}

describe('formatReport', () => {
  it('includes the base and head refs', () => {
    const report = formatReport(result({ diff: { base: 'main', head: 'feature', files: [] } }));
    expect(report).toContain('main -> feature');
  });

  it('includes the score and level', () => {
    const report = formatReport(
      result({ assessment: { score: 87, level: 'critical', factors: [] } }),
    );
    expect(report).toContain('87/100 (CRITICAL)');
  });

  it('lists each factor with its score and detail', () => {
    const report = formatReport(
      result({
        assessment: {
          score: 40,
          level: 'medium',
          factors: [
            { id: 'change-size', label: 'Change size', score: 40, weight: 1, detail: '3 files' },
          ],
        },
      }),
    );
    expect(report).toContain('Change size: 40/100 — 3 files');
  });

  it('notes when there are no file changes', () => {
    const report = formatReport(result());
    expect(report).toContain('No file changes detected.');
  });
});
