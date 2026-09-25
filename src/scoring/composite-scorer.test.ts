import { describe, expect, it } from 'vitest';
import type { RiskFactor } from '../types/index.js';
import { computeRiskAssessment, scoreToLevel } from './composite-scorer.js';

function factor(overrides: Partial<RiskFactor> = {}): RiskFactor {
  return { id: 'f', label: 'Factor', score: 0, weight: 1, detail: '', ...overrides };
}

describe('scoreToLevel', () => {
  it('maps score ranges to levels', () => {
    expect(scoreToLevel(0)).toBe('low');
    expect(scoreToLevel(24)).toBe('low');
    expect(scoreToLevel(25)).toBe('medium');
    expect(scoreToLevel(49)).toBe('medium');
    expect(scoreToLevel(50)).toBe('high');
    expect(scoreToLevel(74)).toBe('high');
    expect(scoreToLevel(75)).toBe('critical');
    expect(scoreToLevel(100)).toBe('critical');
  });
});

describe('computeRiskAssessment', () => {
  it('returns zero score and low level with no factors', () => {
    const assessment = computeRiskAssessment([]);
    expect(assessment).toEqual({ score: 0, level: 'low', factors: [] });
  });

  it('returns the single factor score when there is only one factor', () => {
    const assessment = computeRiskAssessment([factor({ score: 60 })]);
    expect(assessment.score).toBe(60);
    expect(assessment.level).toBe('high');
  });

  it('computes a weighted average across multiple factors', () => {
    const assessment = computeRiskAssessment([
      factor({ score: 100, weight: 1 }),
      factor({ score: 0, weight: 3 }),
    ]);
    // (100*1 + 0*3) / 4 = 25
    expect(assessment.score).toBe(25);
    expect(assessment.level).toBe('medium');
  });

  it('ignores zero-weight factors in the score but keeps them in the report', () => {
    const assessment = computeRiskAssessment([
      factor({ id: 'a', score: 80, weight: 1 }),
      factor({ id: 'b', score: 0, weight: 0 }),
    ]);
    expect(assessment.score).toBe(80);
    expect(assessment.factors).toHaveLength(2);
  });

  it('preserves factor order in the report', () => {
    const assessment = computeRiskAssessment([
      factor({ id: 'a' }),
      factor({ id: 'b' }),
      factor({ id: 'c' }),
    ]);
    expect(assessment.factors.map((f) => f.id)).toEqual(['a', 'b', 'c']);
  });
});
