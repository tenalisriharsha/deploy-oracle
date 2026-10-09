import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

const CLI_PATH = fileURLToPath(new URL('./index.ts', import.meta.url));
const TSX_LOADER = pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm')).href;

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs the real CLI entrypoint (through tsx, so no build is needed) and captures its exit code. */
async function runCli(cwd: string, args: string[]): Promise<CliResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['--import', TSX_LOADER, CLI_PATH, ...args],
      { cwd },
    );
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code: number; stdout: string; stderr: string };
    return { code: failure.code, stdout: failure.stdout, stderr: failure.stderr };
  }
}

describe('deploy-oracle CLI', () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), 'deploy-oracle-cli-'));
    await execFileAsync('git', ['init', '-q'], { cwd: repoDir });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoDir });
    await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: repoDir });
    await writeFile(join(repoDir, 'a.txt'), 'hello\n');
    await execFileAsync('git', ['add', '.'], { cwd: repoDir });
    await execFileAsync('git', ['commit', '-q', '-m', 'initial commit'], { cwd: repoDir });
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  it('exits 0 with a report when the default config file is absent', async () => {
    const result = await runCli(repoDir, ['analyze']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Risk score: 0/100 (LOW)');
  });

  it('fails instead of silently using defaults when an explicit --config path is missing', async () => {
    const result = await runCli(repoDir, ['analyze', '--config', 'missing.json']);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr.trim()).toBe('deploy-oracle: config file missing.json not found');
  });

  it('prefixes a config error with the tool name exactly once', async () => {
    await writeFile(join(repoDir, '.deployoraclerc.json'), '{bad');

    const result = await runCli(repoDir, ['analyze']);

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/^deploy-oracle: failed to parse \.deployoraclerc\.json/);
    expect(result.stderr).not.toContain('deploy-oracle: deploy-oracle:');
  });

  it('exits 1 with a one-line git error for an unknown ref', async () => {
    const result = await runCli(repoDir, ['analyze', '--base', 'no-such-ref']);

    expect(result.code).toBe(1);
    expect(result.stderr.trim().split('\n')).toHaveLength(1);
    expect(result.stderr).toContain('unknown revision or path not in the working tree');
  });
});
