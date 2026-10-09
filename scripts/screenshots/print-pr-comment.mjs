// Prints the exact Markdown body the GitHub Action posts as a PR comment,
// using the built library (run `npm run build` first). Usage, from the repo root:
//   node scripts/screenshots/print-pr-comment.mjs <base> <head>
import { analyze } from '../../dist/analyze.js';
import { formatMarkdownReport } from '../../dist/cli/report.js';

const [base, head] = process.argv.slice(2);
if (!base || !head) {
  console.error('usage: print-pr-comment.mjs <base> <head>');
  process.exit(2);
}

const result = await analyze({ base, head, cwd: process.cwd() });
console.log(formatMarkdownReport(result));
