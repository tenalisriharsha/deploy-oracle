export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskFactor {
  id: string;
  label: string;
  /** Contribution to overall risk, 0-100. */
  score: number;
  /** Relative importance of this factor, 0-1. */
  weight: number;
  detail: string;
  /**
   * Minimum overall level this factor imposes, whatever the weighted average
   * says. Lets a single decisive signal (a change on a critical path) hold the
   * rollout at a cautious tier instead of being averaged away by small, tested
   * diffs. Ignored when the factor's weight is 0.
   */
  floor?: RiskLevel;
}

export interface FloorApplied {
  /** The level the floor raised the assessment to. */
  level: RiskLevel;
  /** Id of the factor that imposed the floor. */
  factorId: string;
  /** The weighted-average score before the floor was applied. */
  rawScore: number;
  /** The level the weighted average alone would have produced. */
  rawLevel: RiskLevel;
}

export interface RiskAssessment {
  score: number;
  level: RiskLevel;
  factors: RiskFactor[];
  /** Present only when a factor floor raised the level above the weighted average's. */
  floorApplied?: FloorApplied;
}
