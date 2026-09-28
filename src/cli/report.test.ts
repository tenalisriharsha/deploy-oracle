import { describe, expect, it } from 'vitest';
import type { AnalysisResult } from '../analyze.js';
import { formatMarkdownReport, formatReport } from './report.js';

function result(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    diff: { base: 'HEAD', head: 'working-tree', files: [] },
    assessment: { score: 0, level: 'low', factors: [] },
    rollout: {
      canaryPercentage: 100,
      skipCanary: true,
      monitoringFocusAreas: ['watch standard health metrics'],
      rollbackPlan: 'revert if anything looks wrong',
    },
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

  it('shows a full rollout with no canary when skipCanary is set', () => {
    const report = formatReport(result());
    expect(report).toContain('Canary: skip canary, full rollout');
  });

  it('shows the canary percentage when a canary is recommended', () => {
    const report = formatReport(
      result({
        rollout: {
          canaryPercentage: 5,
          skipCanary: false,
          monitoringFocusAreas: ['watch error rates closely'],
          rollbackPlan: 'roll back within minutes',
        },
      }),
    );

    expect(report).toContain('Canary: 5% first');
    expect(report).toContain('watch error rates closely');
    expect(report).toContain('Rollback: roll back within minutes');
  });
});

describe('formatMarkdownReport', () => {
  it('includes the base and head refs', () => {
    const report = formatMarkdownReport(
      result({ diff: { base: 'main', head: 'feature', files: [] } }),
    );
    expect(report).toContain('`main` → `feature`');
  });

  it('includes the score and level', () => {
    const report = formatMarkdownReport(
      result({ assessment: { score: 87, level: 'critical', factors: [] } }),
    );
    expect(report).toContain('87/100 (CRITICAL)');
  });

  it('renders each factor as a table row', () => {
    const report = formatMarkdownReport(
      result({
        diff: {
          base: 'main',
          head: 'feature',
          files: [{ path: 'a.ts', status: 'modified', additions: 1, deletions: 0, binary: false }],
        },
        assessment: {
          score: 40,
          level: 'medium',
          factors: [
            { id: 'change-size', label: 'Change size', score: 40, weight: 1, detail: '3 files' },
          ],
        },
      }),
    );
    expect(report).toContain('| Change size | 40/100 | 3 files |');
  });

  it('escapes pipe characters in factor details so they do not break the table', () => {
    const report = formatMarkdownReport(
      result({
        diff: {
          base: 'main',
          head: 'feature',
          files: [{ path: 'a.ts', status: 'modified', additions: 1, deletions: 0, binary: false }],
        },
        assessment: {
          score: 40,
          level: 'medium',
          factors: [
            { id: 'change-size', label: 'Change size', score: 40, weight: 1, detail: 'a | b' },
          ],
        },
      }),
    );
    expect(report).toContain('| Change size | 40/100 | a \\| b |');
  });

  it('notes when there are no file changes', () => {
    const report = formatMarkdownReport(result());
    expect(report).toContain('No file changes detected.');
  });

  it('shows a full rollout with no canary when skipCanary is set', () => {
    const report = formatMarkdownReport(result());
    expect(report).toContain('Canary: skip canary, full rollout');
  });

  it('shows the canary percentage, monitoring areas, and rollback plan', () => {
    const report = formatMarkdownReport(
      result({
        rollout: {
          canaryPercentage: 5,
          skipCanary: false,
          monitoringFocusAreas: ['watch error rates closely'],
          rollbackPlan: 'roll back within minutes',
        },
      }),
    );

    expect(report).toContain('Canary: 5% first');
    expect(report).toContain('- watch error rates closely');
    expect(report).toContain('Rollback: roll back within minutes');
  });
});
