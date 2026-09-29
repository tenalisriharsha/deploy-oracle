import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_BLAST_RADIUS_OPTIONS, type BlastRadiusOptions } from '../scoring/blast-radius.js';
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
): Promise<DeployOracleConfig> {
  let raw: string;
  try {
    raw = await readFile(path.join(rootDir, configPath), 'utf8');
  } catch {
    return DEFAULT_CONFIG;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`deploy-oracle: failed to parse ${configPath}: ${(error as Error).message}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`deploy-oracle: ${configPath} must contain a JSON object`);
  }

  const config = parsed as Record<string, unknown>;

  return {
    changeSize: { ...DEFAULT_CHANGE_SIZE_THRESHOLDS, ...asRecord(config.changeSize) },
    blastRadius: { ...DEFAULT_BLAST_RADIUS_OPTIONS, ...asRecord(config.blastRadius) },
    testCoverage: { ...DEFAULT_TEST_COVERAGE_OPTIONS, ...asRecord(config.testCoverage) },
    weights: asRecord(config.weights) as FactorWeights,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
