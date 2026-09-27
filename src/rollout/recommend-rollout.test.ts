import { describe, expect, it } from 'vitest';
import type { RiskAssessment, RiskFactor } from '../types/index.js';
import { recommendRollout } from './recommend-rollout.js';

function factor(overrides: Partial<RiskFactor> = {}): RiskFactor {
  return {
    id: 'change-size',
    label: 'Change size',
    score: 0,
    weight: 1,
    detail: 'no changes',
    ...overrides,
  };
}

function assessment(overrides: Partial<RiskAssessment> = {}): RiskAssessment {
  return {
    score: 0,
    level: 'low',
    factors: [],
    ...overrides,
  };
}

describe('recommendRollout', () => {
  it('recommends a full rollout with no canary for low risk', () => {
    const strategy = recommendRollout(assessment({ level: 'low' }));

    expect(strategy.canaryPercentage).toBe(100);
    expect(strategy.skipCanary).toBe(true);
  });

  it('recommends a moderate canary for medium risk', () => {
    const strategy = recommendRollout(assessment({ level: 'medium' }));

    expect(strategy.canaryPercentage).toBe(50);
    expect(strategy.skipCanary).toBe(false);
  });

  it('recommends a small canary for high risk', () => {
    const strategy = recommendRollout(assessment({ level: 'high' }));

    expect(strategy.canaryPercentage).toBe(25);
    expect(strategy.skipCanary).toBe(false);
  });

  it('recommends a tiny canary and urgent rollback plan for critical risk', () => {
    const strategy = recommendRollout(assessment({ level: 'critical' }));

    expect(strategy.canaryPercentage).toBe(5);
    expect(strategy.skipCanary).toBe(false);
    expect(strategy.rollbackPlan).toMatch(/on-call/i);
  });

  it('falls back to a generic monitoring note when no factor crosses the threshold', () => {
    const strategy = recommendRollout(
      assessment({
        level: 'low',
        factors: [factor({ score: 10 }), factor({ id: 'blast-radius', score: 20 })],
      }),
    );

    expect(strategy.monitoringFocusAreas).toHaveLength(1);
    expect(strategy.monitoringFocusAreas[0]).toMatch(/standard health metrics/i);
  });

  it('calls out change-size specifically when it crosses the threshold', () => {
    const strategy = recommendRollout(
      assessment({
        level: 'high',
        factors: [factor({ id: 'change-size', score: 80, detail: '40 files changed' })],
      }),
    );

    expect(strategy.monitoringFocusAreas).toHaveLength(1);
    expect(strategy.monitoringFocusAreas[0]).toContain('40 files changed');
  });

  it('calls out blast-radius specifically when it crosses the threshold', () => {
    const strategy = recommendRollout(
      assessment({
        level: 'critical',
        factors: [
          factor({ id: 'blast-radius', score: 100, detail: 'touches critical path: src/auth/login.ts' }),
        ],
      }),
    );

    expect(strategy.monitoringFocusAreas[0]).toContain('src/auth/login.ts');
    expect(strategy.monitoringFocusAreas[0]).toMatch(/downstream consumers/i);
  });

  it('calls out test-coverage specifically when it crosses the threshold', () => {
    const strategy = recommendRollout(
      assessment({
        level: 'medium',
        factors: [
          factor({ id: 'test-coverage', score: 100, detail: '1/1 changed files with no test coverage' }),
        ],
      }),
    );

    expect(strategy.monitoringFocusAreas[0]).toMatch(/regressions in the paths/i);
  });

  it('includes one focus area per triggered factor when every factor is maxed', () => {
    const strategy = recommendRollout(
      assessment({
        level: 'critical',
        factors: [
          factor({ id: 'change-size', score: 100, detail: '50 files changed' }),
          factor({ id: 'blast-radius', score: 100, detail: '20 known dependents' }),
          factor({ id: 'test-coverage', score: 100, detail: 'no coverage anywhere' }),
        ],
      }),
    );

    expect(strategy.monitoringFocusAreas).toHaveLength(3);
  });

  it('uses a generic callout for an unrecognized factor id above the threshold', () => {
    const strategy = recommendRollout(
      assessment({
        level: 'medium',
        factors: [factor({ id: 'custom-factor', label: 'Custom factor', score: 60, detail: 'something odd' })],
      }),
    );

    expect(strategy.monitoringFocusAreas[0]).toContain('Custom factor');
    expect(strategy.monitoringFocusAreas[0]).toContain('something odd');
  });
});
