import type { FloorApplied, RiskAssessment, RiskFactor, RiskLevel } from '../types/index.js';

const LEVEL_THRESHOLDS: { level: RiskLevel; min: number }[] = [
  { level: 'critical', min: 75 },
  { level: 'high', min: 50 },
  { level: 'medium', min: 25 },
  { level: 'low', min: 0 },
];

const LEVEL_ORDER: RiskLevel[] = ['low', 'medium', 'high', 'critical'];

function levelRank(level: RiskLevel): number {
  return LEVEL_ORDER.indexOf(level);
}

function levelMinScore(level: RiskLevel): number {
  return LEVEL_THRESHOLDS.find((entry) => entry.level === level)?.min ?? 0;
}

export function scoreToLevel(score: number): RiskLevel {
  const match = LEVEL_THRESHOLDS.find((entry) => score >= entry.min);
  return match?.level ?? 'low';
}

/**
 * Combines individual risk factors into a single weighted assessment.
 * Factors with weight 0 still appear in the report but don't move the score
 * and impose no floor.
 *
 * A weighted average can dilute one decisive signal: a one file migration on a
 * critical path scores 100 on blast radius but can still average out to a low
 * or medium level next to a small diff and a passing test. A factor can
 * therefore declare a `floor`, the minimum overall level it imposes. When a
 * floor is higher than the average's level, the level is raised to it and the
 * score is lifted to that level's lower bound so the two never disagree.
 */
export function computeRiskAssessment(factors: RiskFactor[]): RiskAssessment {
  const totalWeight = factors.reduce((sum, factor) => sum + factor.weight, 0);
  const score =
    totalWeight === 0
      ? 0
      : Math.round(
          factors.reduce((sum, factor) => sum + factor.score * factor.weight, 0) / totalWeight,
        );

  const rawLevel = scoreToLevel(score);
  const flooring = factors
    .filter((factor) => factor.weight > 0 && factor.floor !== undefined)
    .reduce<RiskFactor | undefined>(
      (strongest, factor) =>
        strongest === undefined || levelRank(factor.floor!) > levelRank(strongest.floor!)
          ? factor
          : strongest,
      undefined,
    );

  if (flooring?.floor === undefined || levelRank(flooring.floor) <= levelRank(rawLevel)) {
    return { score, level: rawLevel, factors };
  }

  const floorApplied: FloorApplied = {
    level: flooring.floor,
    factorId: flooring.id,
    rawScore: score,
    rawLevel,
  };
  return {
    score: Math.max(score, levelMinScore(flooring.floor)),
    level: flooring.floor,
    factors,
    floorApplied,
  };
}
