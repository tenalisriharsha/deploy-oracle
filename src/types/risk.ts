export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskFactor {
  id: string;
  label: string;
  /** Contribution to overall risk, 0-100. */
  score: number;
  /** Relative importance of this factor, 0-1. */
  weight: number;
  detail: string;
}

export interface RiskAssessment {
  score: number;
  level: RiskLevel;
  factors: RiskFactor[];
}
