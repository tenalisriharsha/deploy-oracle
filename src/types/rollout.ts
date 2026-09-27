export interface RolloutStrategy {
  /** Percentage of traffic/instances to roll out to first, 0-100. */
  canaryPercentage: number;
  /** Whether the canary phase can be skipped entirely for a full rollout. */
  skipCanary: boolean;
  /** What to watch during rollout, derived from which risk factors triggered. */
  monitoringFocusAreas: string[];
  /** What to do if the rollout shows signs of trouble. */
  rollbackPlan: string;
}
