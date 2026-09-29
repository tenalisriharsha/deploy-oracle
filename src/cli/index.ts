#!/usr/bin/env node
import { Command } from 'commander';
import { analyze } from '../analyze.js';
import { loadConfig } from '../config/load-config.js';
import { formatReport } from './report.js';

const program = new Command();

program
  .name('deploy-oracle')
  .description('Analyzes a pull request and outputs a deploy risk score with a rollout strategy.')
  .version('0.1.0');

program
  .command('analyze')
  .description('Score the risk of the changes between two refs')
  .option('-b, --base <ref>', 'base ref to compare against', 'HEAD')
  .option('-H, --head <ref>', 'head ref to compare (defaults to the working tree)')
  .option(
    '-c, --config <path>',
    'path to a config file, relative to cwd',
    '.deployoraclerc.json',
  )
  .option('--json', 'output the raw assessment as JSON', false)
  .action(async (opts: { base: string; head?: string; config: string; json: boolean }) => {
    try {
      const cwd = process.cwd();
      const config = await loadConfig(cwd, opts.config);
      const result = await analyze(
        opts.head ? { base: opts.base, head: opts.head, cwd, config } : { base: opts.base, cwd, config },
      );
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatReport(result));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`deploy-oracle: ${message}`);
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv);
