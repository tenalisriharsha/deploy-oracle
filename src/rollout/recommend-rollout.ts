import type { RiskAssessment, RiskFactor, RiskLevel, RolloutStrategy } from '../types/index.js';

interface LevelDefaults {
  canaryPercentage: number;
  skipCanary: boolean;
  rollbackPlan: string;
}

const LEVEL_DEFAULTS: Record<RiskLevel, LevelDefaults> = {
  low: {
    canaryPercentage: 100,
    skipCanary: true,
    rollbackPlan: 'Standard rollback: revert the deploy if dashboards or alerts show a regression.',
  },
  medium: {
    canaryPercentage: 50,
    skipCanary: false,
    rollbackPlan:
      'Hold at the canary stage until key metrics look stable, then roll back to the previous version if error rates or latency regress.',
  },
  high: {
    canaryPercentage: 25,
    skipCanary: false,
    rollbackPlan:
      'Keep the previous version ready to restore; roll back at the first sign of regression rather than waiting out the full canary window.',
  },
  critical: {
    canaryPercentage: 5,
    skipCanary: false,
    rollbackPlan:
      'Notify on-call before deploying; treat any anomaly as a rollback trigger and execute the rollback within minutes.',
  },
};

/** Minimum factor score before it earns a callout in the monitoring plan. */
const FACTOR_ATTENTION_THRESHOLD = 50;

function monitoringAreaFor(factor: RiskFactor): string | undefined {
  if (factor.score < FACTOR_ATTENTION_THRESHOLD) return undefined;

  switch (factor.id) {
    case 'change-size':
      return `Change size is elevated (${factor.score}/100) — ${factor.detail}. Watch broad error and latency dashboards, since a large diff raises the odds of an overlooked regression.`;
    case 'blast-radius':
      return `Blast radius is elevated (${factor.score}/100) — ${factor.detail}. Monitor the downstream consumers of the changed files closely.`;
    case 'test-coverage':
      return `Test coverage delta is elevated (${factor.score}/100) — ${factor.detail}. Monitor for regressions in the paths that shipped without test updates.`;
    default:
      return `${factor.label} is elevated (${factor.score}/100) — ${factor.detail}.`;
  }
}

/**
 * Derives a rollout strategy (canary percentage, monitoring focus areas,
 * rollback plan) from a composite risk assessment. Canary sizing and the
 * rollback plan come from the overall level; monitoring focus areas are
 * pulled from whichever individual factors crossed the attention threshold,
 * so the plan calls out *what* to watch, not just *how carefully*.
 */
export function recommendRollout(assessment: RiskAssessment): RolloutStrategy {
  const defaults = LEVEL_DEFAULTS[assessment.level];

  const monitoringFocusAreas = assessment.factors
    .map(monitoringAreaFor)
    .filter((area): area is string => area !== undefined);

  if (monitoringFocusAreas.length === 0) {
    monitoringFocusAreas.push(
      'No individual risk factor crossed the attention threshold; watch standard health metrics.',
    );
  }

  return {
    canaryPercentage: defaults.canaryPercentage,
    skipCanary: defaults.skipCanary,
    monitoringFocusAreas,
    rollbackPlan: defaults.rollbackPlan,
  };
}
