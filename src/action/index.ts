import { analyze } from '../analyze.js';
import { formatMarkdownReport, formatReport } from '../cli/report.js';
import { upsertReportComment } from './comment.js';
import { resolveActionContext } from './github-context.js';

async function run(): Promise<void> {
  const context = await resolveActionContext({ env: process.env });
  const cwd = process.env.GITHUB_WORKSPACE ?? process.cwd();

  const result = await analyze(
    context.head ? { base: context.base, head: context.head, cwd } : { base: context.base, cwd },
  );

  console.log(formatReport(result));

  if (!context.prNumber) {
    console.log('deploy-oracle: no pull request in context, skipping comment.');
    return;
  }

  const token = process.env.INPUT_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!token) {
    console.log('deploy-oracle: no token provided, skipping comment.');
    return;
  }

  await upsertReportComment({
    token,
    owner: context.owner,
    repo: context.repo,
    issueNumber: context.prNumber,
    body: formatMarkdownReport(result),
  });
  console.log(`deploy-oracle: posted report comment on PR #${context.prNumber}.`);
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`deploy-oracle-action: ${message}`);
  process.exitCode = 1;
});
