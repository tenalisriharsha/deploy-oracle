import type { RiskAssessment, RiskFactor, RiskLevel } from '../types/index.js';

const LEVEL_THRESHOLDS: { level: RiskLevel; min: number }[] = [
  { level: 'critical', min: 75 },
  { level: 'high', min: 50 },
  { level: 'medium', min: 25 },
  { level: 'low', min: 0 },
];

export function scoreToLevel(score: number): RiskLevel {
  const match = LEVEL_THRESHOLDS.find((entry) => score >= entry.min);
  return match?.level ?? 'low';
}

/**
 * Combines individual risk factors into a single weighted assessment.
 * Factors with weight 0 still appear in the report but don't move the score.
 */
export function computeRiskAssessment(factors: RiskFactor[]): RiskAssessment {
  const totalWeight = factors.reduce((sum, factor) => sum + factor.weight, 0);
  const score =
    totalWeight === 0
      ? 0
      : Math.round(
          factors.reduce((sum, factor) => sum + factor.score * factor.weight, 0) / totalWeight,
        );

  return {
    score,
    level: scoreToLevel(score),
    factors,
  };
}
