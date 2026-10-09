import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CRITICAL_PATH_FLOOR_VALUES,
  DEFAULT_BLAST_RADIUS_OPTIONS,
  type BlastRadiusOptions,
} from '../scoring/blast-radius.js';
import { DEFAULT_CHANGE_SIZE_THRESHOLDS, type ChangeSizeThresholds } from '../scoring/change-size.js';
import { DEFAULT_TEST_COVERAGE_OPTIONS, type TestCoverageOptions } from '../scoring/test-coverage.js';

const DEFAULT_CONFIG_PATH = '.deployoraclerc.json';

/** Per-risk-factor weight overrides, keyed by `RiskFactor.id` (e.g. `"blast-radius"`). */
export interface FactorWeights {
  [factorId: string]: number;
}

export interface DeployOracleConfig {
  changeSize: ChangeSizeThresholds;
  blastRadius: BlastRadiusOptions;
  testCoverage: TestCoverageOptions;
  weights: FactorWeights;
}

export const DEFAULT_CONFIG: DeployOracleConfig = {
  changeSize: DEFAULT_CHANGE_SIZE_THRESHOLDS,
  blastRadius: DEFAULT_BLAST_RADIUS_OPTIONS,
  testCoverage: DEFAULT_TEST_COVERAGE_OPTIONS,
  weights: {},
};

export interface LoadConfigOptions {
  /** Throw if the file does not exist, e.g. when the path was passed explicitly. */
  required?: boolean;
}

/**
 * Loads `<rootDir>/<configPath>` (default `.deployoraclerc.json`) and merges
 * it over the built-in defaults, section by section. Unlike the coverage
 * report — an optional build artifact most repos won't have — a config file
 * only exists because someone wrote it, so a present-but-malformed file
 * throws instead of silently falling back to defaults.
 */
export async function loadConfig(
  rootDir: string,
  configPath: string = DEFAULT_CONFIG_PATH,
  options: LoadConfigOptions = {},
): Promise<DeployOracleConfig> {
  let raw: string;
  try {
    raw = await readFile(path.join(rootDir, configPath), 'utf8');
  } catch (error) {
    // Only a missing file means "no config"; anything else (a directory, no
    // read permission) is a config someone meant to use, so surface it.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error(`failed to read ${configPath}: ${(error as Error).message}`);
    }
    if (options.required) {
      throw new Error(`config file ${configPath} not found`);
    }
    return DEFAULT_CONFIG;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`failed to parse ${configPath}: ${(error as Error).message}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${configPath} must contain a JSON object`);
  }

  const config = parsed as Record<string, unknown>;

  const changeSize = asRecord(config.changeSize);
  const blastRadius = asRecord(config.blastRadius);
  const testCoverage = asRecord(config.testCoverage);
  const weights = asRecord(config.weights);

  // A wrong-typed threshold or weight would otherwise turn the score into NaN,
  // which scoreToLevel() reports as LOW: the least safe possible failure mode.
  assertNonNegativeNumber(changeSize.maxFiles, `${configPath} changeSize.maxFiles`);
  assertNonNegativeNumber(changeSize.maxLines, `${configPath} changeSize.maxLines`);
  assertNonNegativeNumber(blastRadius.maxDependents, `${configPath} blastRadius.maxDependents`);
  assertNonNegativeNumber(
    testCoverage.lowCoverageThreshold,
    `${configPath} testCoverage.lowCoverageThreshold`,
  );
  for (const [factorId, weight] of Object.entries(weights)) {
    assertNonNegativeNumber(weight, `${configPath} weights.${factorId}`);
  }
  if (
    blastRadius.criticalPathGlobs !== undefined &&
    (!Array.isArray(blastRadius.criticalPathGlobs) ||
      !blastRadius.criticalPathGlobs.every((glob) => typeof glob === 'string'))
  ) {
    throw new Error(`${configPath} blastRadius.criticalPathGlobs must be an array of strings`);
  }

  if (
    blastRadius.criticalPathFloor !== undefined &&
    !CRITICAL_PATH_FLOOR_VALUES.includes(blastRadius.criticalPathFloor as never)
  ) {
    throw new Error(
      `${configPath} blastRadius.criticalPathFloor must be one of ${CRITICAL_PATH_FLOOR_VALUES.join(', ')}`,
    );
  }

  return {
    changeSize: { ...DEFAULT_CHANGE_SIZE_THRESHOLDS, ...changeSize },
    blastRadius: { ...DEFAULT_BLAST_RADIUS_OPTIONS, ...blastRadius },
    testCoverage: { ...DEFAULT_TEST_COVERAGE_OPTIONS, ...testCoverage },
    weights: weights as FactorWeights,
  };
}

function assertNonNegativeNumber(value: unknown, field: string): void {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a non-negative number, got ${JSON.stringify(value)}`);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
