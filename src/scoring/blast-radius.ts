import type { FileChange, RiskFactor, RiskLevel } from '../types/index.js';
import { countDependents, type DependencyGraph } from './dependency-graph.js';
import { matchesAnyGlob } from './glob.js';

export interface BlastRadiusOptions {
  /** Path globs (supporting `*` and `**`) considered inherently high-risk. */
  criticalPathGlobs: string[];
  /** Dependent count at or above which the fan-in score saturates at 100. */
  maxDependents: number;
  /**
   * Minimum overall level imposed when a changed file matches a critical path
   * glob, or `'none'` to rely on the weighted average alone. Defaults to
   * `'high'`.
   */
  criticalPathFloor?: RiskLevel | 'none';
}

export const CRITICAL_PATH_FLOOR_VALUES: ReadonlyArray<RiskLevel | 'none'> = [
  'none',
  'low',
  'medium',
  'high',
  'critical',
];

export const DEFAULT_CRITICAL_PATH_GLOBS: string[] = [
  '**/auth/**',
  '**/*auth*',
  '**/payment*/**',
  '**/*payment*',
  '**/billing*/**',
  '**/*billing*',
  '**/migrations/**',
  '**/*migration*',
  '**/security/**',
  '**/*security*',
  '**/secrets/**',
  '**/*secrets*',
  '**/config/**',
  '**/*.config.*',
];

const DEFAULT_CRITICAL_PATH_FLOOR: RiskLevel | 'none' = 'high';

export const DEFAULT_BLAST_RADIUS_OPTIONS: BlastRadiusOptions = {
  criticalPathGlobs: DEFAULT_CRITICAL_PATH_GLOBS,
  maxDependents: 15,
  criticalPathFloor: DEFAULT_CRITICAL_PATH_FLOOR,
};

/**
 * Scores risk from how far a change's effects could ripple: files with many
 * known dependents are riskier to change than leaf files, and files on a
 * configured "critical path" (auth, payments, migrations, config, ...) are
 * treated as high risk regardless of fan-in, since static analysis alone
 * can't see every caller (dynamic dispatch, other services, etc).
 */
export function scoreBlastRadius(
  files: FileChange[],
  graph: DependencyGraph,
  options: BlastRadiusOptions = DEFAULT_BLAST_RADIUS_OPTIONS,
): RiskFactor {
  let maxDependents = 0;
  let maxDependentsPath: string | undefined;

  for (const file of files) {
    const count = countDependents(graph, file.path);
    if (count > maxDependents) {
      maxDependents = count;
      maxDependentsPath = file.path;
    }
  }

  const criticalMatches = files
    .map((file) => file.path)
    .filter((path) => matchesAnyGlob(path, options.criticalPathGlobs) !== undefined);

  const dependentScore =
    options.maxDependents <= 0 ? 0 : Math.min(100, (maxDependents / options.maxDependents) * 100);
  const criticalScore = criticalMatches.length > 0 ? 100 : 0;
  const criticalPathFloor = options.criticalPathFloor ?? DEFAULT_CRITICAL_PATH_FLOOR;
  const score = Math.round(Math.max(dependentScore, criticalScore));

  const detailParts: string[] = [];
  detailParts.push(
    maxDependentsPath
      ? `${maxDependentsPath} has ${maxDependents} known dependent${maxDependents === 1 ? '' : 's'}`
      : 'no internal dependents detected',
  );
  if (criticalMatches.length > 0) {
    detailParts.push(
      `touches critical path${criticalMatches.length === 1 ? '' : 's'}: ${criticalMatches.join(', ')}`,
    );
  }

  return {
    id: 'blast-radius',
    label: 'Blast radius',
    score,
    weight: 1,
    detail: detailParts.join('; '),
    ...(criticalMatches.length > 0 && criticalPathFloor !== 'none'
      ? { floor: criticalPathFloor }
      : {}),
  };
}
