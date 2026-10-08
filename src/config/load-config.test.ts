import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, loadConfig } from './load-config.js';

describe('loadConfig', () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'deploy-oracle-config-'));
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it('returns the built-in defaults when no config file exists', async () => {
    expect(await loadConfig(rootDir)).toEqual(DEFAULT_CONFIG);
  });

  it('throws when the config file is not valid JSON', async () => {
    await writeFile(join(rootDir, '.deployoraclerc.json'), 'not json');

    await expect(loadConfig(rootDir)).rejects.toThrow(/failed to parse/);
  });

  it('throws when the config file is not a JSON object', async () => {
    await writeFile(join(rootDir, '.deployoraclerc.json'), '[1, 2, 3]');

    await expect(loadConfig(rootDir)).rejects.toThrow(/must contain a JSON object/);
  });

  it('merges each section over its defaults', async () => {
    await writeFile(
      join(rootDir, '.deployoraclerc.json'),
      JSON.stringify({
        changeSize: { maxFiles: 10 },
        blastRadius: { maxDependents: 5 },
        testCoverage: { lowCoverageThreshold: 80 },
        weights: { 'blast-radius': 2 },
      }),
    );

    const config = await loadConfig(rootDir);

    expect(config.changeSize).toEqual({ maxFiles: 10, maxLines: DEFAULT_CONFIG.changeSize.maxLines });
    expect(config.blastRadius.maxDependents).toBe(5);
    expect(config.blastRadius.criticalPathGlobs).toEqual(DEFAULT_CONFIG.blastRadius.criticalPathGlobs);
    expect(config.testCoverage).toEqual({ lowCoverageThreshold: 80 });
    expect(config.weights).toEqual({ 'blast-radius': 2 });
  });

  it('reads from a custom config path', async () => {
    await writeFile(join(rootDir, 'custom.json'), JSON.stringify({ weights: { 'change-size': 3 } }));

    const config = await loadConfig(rootDir, 'custom.json');

    expect(config.weights).toEqual({ 'change-size': 3 });
  });

  it('ignores non-object section values', async () => {
    await writeFile(join(rootDir, '.deployoraclerc.json'), JSON.stringify({ changeSize: 'nope' }));

    const config = await loadConfig(rootDir);

    expect(config.changeSize).toEqual(DEFAULT_CONFIG.changeSize);
  });

  it('accepts a valid blastRadius.criticalPathFloor', async () => {
    await writeFile(
      join(rootDir, '.deployoraclerc.json'),
      JSON.stringify({ blastRadius: { criticalPathFloor: 'none' } }),
    );

    const config = await loadConfig(rootDir);
    expect(config.blastRadius.criticalPathFloor).toBe('none');
  });

  it('defaults criticalPathFloor to high', async () => {
    const config = await loadConfig(rootDir);
    expect(config.blastRadius.criticalPathFloor).toBe('high');
  });

  it('throws on an unknown criticalPathFloor instead of silently ignoring it', async () => {
    await writeFile(
      join(rootDir, '.deployoraclerc.json'),
      JSON.stringify({ blastRadius: { criticalPathFloor: 'urgent' } }),
    );

    await expect(loadConfig(rootDir)).rejects.toThrow(/criticalPathFloor must be one of/);
  });

  it.each([
    [{ changeSize: { maxFiles: 'abc' } }, /changeSize\.maxFiles must be a non-negative number/],
    [{ changeSize: { maxLines: -5 } }, /changeSize\.maxLines must be a non-negative number/],
    [{ blastRadius: { maxDependents: null } }, /blastRadius\.maxDependents must be/],
    [{ testCoverage: { lowCoverageThreshold: '80' } }, /lowCoverageThreshold must be/],
    [{ weights: { 'blast-radius': 'x' } }, /weights\.blast-radius must be a non-negative number/],
    [{ weights: { 'change-size': -1 } }, /weights\.change-size must be a non-negative number/],
    [{ blastRadius: { criticalPathGlobs: '**/auth/**' } }, /criticalPathGlobs must be an array/],
  ])('rejects a wrong-typed value instead of scoring NaN as LOW: %j', async (raw, message) => {
    await writeFile(join(rootDir, '.deployoraclerc.json'), JSON.stringify(raw));

    await expect(loadConfig(rootDir)).rejects.toThrow(message);
  });
});

