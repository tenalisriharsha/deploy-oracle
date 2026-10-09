// Regenerates every image in docs/screenshots from real command output.
//
// Each terminal image shows the command exactly as it was executed (run from
// the repo root with `bash -c`), followed by its captured stdout and stderr,
// unedited, and the exit status the shell reported. The PR comment image is
// the Markdown printed by print-pr-comment.mjs, rendered locally with marked.
//
// Usage, from the repo root, on a clean checkout:
//   npm ci && npm run build
//   (cd scripts/screenshots && npm ci)
//   node scripts/screenshots/generate.mjs
//
// The risk factors scan the working tree for the import graph and existing
// tests, so output reflects the checkout these images were generated from.
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(repoRoot, 'docs/screenshots');

const TERMINAL_SHOTS = [
  {
    file: '01-analyze-high.png',
    title: 'analyze: a HIGH-risk diff from this repo’s history',
    command: 'node dist/cli/index.js analyze --base 972b3a1 --head 03813fb',
  },
  {
    file: '02-analyze-low.png',
    title: 'analyze: a docs-only commit (README.md, PROGRESS.md)',
    command: 'node dist/cli/index.js analyze --base 58ca570 --head a517315',
  },
  {
    file: '03-json.png',
    title: 'analyze --json',
    command: 'node dist/cli/index.js analyze --base 972b3a1 --head 03813fb --json | jq .assessment',
  },
  {
    file: '04-help.png',
    title: '--help',
    command: 'node dist/cli/index.js --help',
  },
  {
    file: '06-custom-config.png',
    title: 'analyze --config: the same diff, reweighted',
    command:
      'cat docs/examples/custom-weights.json && node dist/cli/index.js analyze --base 972b3a1 --head 03813fb --config docs/examples/custom-weights.json',
  },
];

const PR_COMMENT_SHOT = {
  file: '05-pr-comment.png',
  command: 'node scripts/screenshots/print-pr-comment.mjs 972b3a1 03813fb',
};

/** Runs a command from the repo root, capturing stdout and stderr in arrival order. */
function run(command) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['-c', command], { cwd: repoRoot });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ output, code }));
  });
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function terminalHtml({ title, command, output, code }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; padding: 24px; background: #f0f2f5; font-family: -apple-system, Segoe UI, sans-serif; }
  .win { width: 960px; background: #0d1117; border-radius: 10px; overflow: hidden; box-shadow: 0 6px 24px rgba(0,0,0,.25); }
  .bar { background: #161b22; padding: 10px 14px; color: #8b949e; font-size: 13px; display: flex; gap: 8px; align-items: center; }
  .dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
  pre { margin: 0; padding: 16px 20px 20px; color: #e6edf3; font: 14px/1.5 Menlo, Consolas, 'DejaVu Sans Mono', monospace; white-space: pre-wrap; word-break: break-word; }
  .prompt { color: #58a6ff; } .cmd { color: #ffffff; font-weight: 600; }
  .status { color: ${code === 0 ? '#3fb950' : '#f85149'}; }
  </style></head><body><div class="win">
  <div class="bar"><span class="dot" style="background:#ff5f56"></span><span class="dot" style="background:#ffbd2e"></span><span class="dot" style="background:#27c93f"></span><span>&nbsp;${escapeHtml(title)}</span></div>
  <pre><span class="prompt">$ </span><span class="cmd">${escapeHtml(command)}</span>
${escapeHtml(output.replace(/\n$/, ''))}
<span class="status">[exit status ${code}]</span></pre></div></body></html>`;
}

function prCommentHtml({ command, markdown }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; padding: 24px; background: #f6f8fa; font-family: -apple-system, Segoe UI, Helvetica, Arial, sans-serif; color: #1f2328; }
  .card { width: 860px; background: #fff; border: 1px solid #d0d7de; border-radius: 8px; }
  .head { padding: 10px 16px; background: #f6f8fa; border-bottom: 1px solid #d0d7de; border-radius: 8px 8px 0 0; font-size: 13px; color: #59636e; }
  .head code { font-size: 12px; }
  .body { padding: 4px 20px 12px; font-size: 14px; line-height: 1.5; }
  table { border-collapse: collapse; margin: 12px 0; } th, td { border: 1px solid #d0d7de; padding: 6px 12px; text-align: left; vertical-align: top; }
  th { background: #f6f8fa; } code { background: rgba(175,184,193,.2); padding: 1px 5px; border-radius: 6px; font-size: 85%; }
  h3 { margin: 16px 0 8px; }
  </style></head><body><div class="card">
  <div class="head">Local render of the comment body the Action posts, produced by <code>${escapeHtml(command)}</code></div>
  <div class="body">${marked.parse(markdown)}</div></div></body></html>`;
}

async function screenshot(page, html, file) {
  await page.setContent(html);
  const target = await page.$('body > div');
  await target.screenshot({ path: path.join(outDir, file) });
  console.log(`wrote docs/screenshots/${file}`);
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1040, height: 800 }, deviceScaleFactor: 2 });

for (const shot of TERMINAL_SHOTS) {
  const { output, code } = await run(shot.command);
  await screenshot(page, terminalHtml({ ...shot, output, code }), shot.file);
}

const comment = await run(PR_COMMENT_SHOT.command);
if (comment.code !== 0) {
  throw new Error(`${PR_COMMENT_SHOT.command} exited ${comment.code}:\n${comment.output}`);
}
await screenshot(
  page,
  prCommentHtml({ command: PR_COMMENT_SHOT.command, markdown: comment.output }),
  PR_COMMENT_SHOT.file,
);

await browser.close();
