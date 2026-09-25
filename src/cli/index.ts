#!/usr/bin/env node
import { Command } from 'commander';
import { analyze } from '../analyze.js';
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
  .option('--json', 'output the raw assessment as JSON', false)
  .action(async (opts: { base: string; head?: string; json: boolean }) => {
    try {
      const result = await analyze(opts.head ? { base: opts.base, head: opts.head } : { base: opts.base });
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
