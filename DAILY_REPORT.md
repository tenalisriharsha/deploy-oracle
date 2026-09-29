# Daily Report

Summary of the five-night build of `deploy-oracle`, a deployment risk
scoring tool that analyzes a pull request and outputs a risk score with a
recommended rollout strategy, as both a CLI and a GitHub Action.

## Night 1 (2026-09-25) — Scaffold & core foundation

- TypeScript project scaffold: `package.json`, `tsconfig.json`, ESLint (flat
  config), Prettier, Vitest.
- Domain types: `FileChange`, `PullRequestDiff`, `RiskFactor`,
  `RiskAssessment`.
- Pure `git diff --numstat` / `--name-status` parsers, plus
  `getPullRequestDiff()` to shell out to git and merge the two outputs into
  one `FileChange[]`.
- First risk factor: change-size scoring (files touched + lines churned,
  saturating thresholds).
- Composite scorer: weighted average of factors into a 0-100 score +
  low/medium/high/critical level.
- `analyze()` orchestration function and the `deploy-oracle analyze` CLI
  command.
- 32 tests (unit + integration against real temp git repos).

## Night 2 (2026-09-26) — Blast radius & test coverage delta

- `scoring/dependency-graph.ts`: a regex-based local import/require graph
  (relative specifiers only) used to compute fan-in for changed files.
- `scoring/glob.ts`: a small dependency-free `*`/`**` glob-to-RegExp matcher
  for a configurable "critical path" list (auth, payments, billing,
  migrations, security, config).
- Blast-radius risk factor: high score for files with many known dependents
  *or* any file on the critical-path list.
- Test-coverage-delta risk factor: correlates changed source files against
  test files changed in the same diff and existing test files in the repo,
  with optional Istanbul `coverage-summary.json` support to catch
  existing-but-poorly-covered files.
- `fs/repo-scanner.ts` and `fs/coverage-report.ts` added as the only two
  modules that touch the filesystem for these factors.
- 72 tests total.

## Night 3 (2026-09-27) — Rollout strategy recommendation

- `RolloutStrategy` type: canary percentage, `skipCanary` flag, monitoring
  focus areas, rollback plan.
- `recommendRollout()`: a pure function (`RiskAssessment` in,
  `RolloutStrategy` out) with no knowledge of git, the filesystem, or the
  CLI. Canary size and rollback plan derive from the overall risk level;
  monitoring focus areas are pulled per-factor for any factor scoring ≥ 50,
  with factor-specific phrasing plus a generic fallback for unrecognized
  factor ids.
- Wired into `analyze()` and surfaced in both the plain-text CLI report and
  `--json` output.
- 84 tests total.

## Night 4 (2026-09-28) — GitHub Action

- Packaged as a composite action (`action.yml`): installs deps and builds
  against its own checkout, then runs `dist/action/index.js`. No bundler
  needed since the analysis code path has zero runtime npm dependencies.
- `action/github-context.ts` resolves base/head + PR number from explicit
  inputs or the `pull_request` event payload, falling back to
  `GITHUB_BASE_REF` when there's no event.
- `action/index.ts` calls the same `analyze()` the CLI uses, always logs
  the plain-text report, and posts/updates a single Markdown PR comment
  (found via a hidden HTML marker) when a PR number and token are both
  available.
- `action/comment.ts` upserts that comment using Node's built-in `fetch`
  against the GitHub REST API — no Octokit/`@actions/*` dependency.
- `cli/report.ts` gained `formatMarkdownReport()` for the Action's comment
  body.
- End-to-end example workflow (`.github/workflows/deploy-oracle.yml`) that
  runs the action on this repo's own PRs.
- 101 tests total.

## Night 5 (2026-09-29) — Config file support, CI, README polish

- `config/load-config.ts`: loads `.deployoraclerc.json` (if present) from
  `cwd` and merges it, section by section, over the defaults every scoring
  function already exported (`changeSize`, `blastRadius`, `testCoverage`)
  plus a new `weights` map (factor id → weight override) applied as a
  post-processing step in `analyze()`. A missing file falls back to
  defaults silently; a present-but-malformed one throws, since a config
  file — unlike the optional coverage report — only exists because someone
  wrote it.
- `analyze()` gained an optional `config` param (auto-loaded from `cwd` if
  omitted); the CLI gained `-c, --config <path>`; the Action needed no
  changes since it already resolves `cwd` to `GITHUB_WORKSPACE`.
- `.github/workflows/ci.yml`: lint, typecheck, test, and build on every
  push/PR to `main`, separate from the Action's self-dogfooding workflow.
- README: a full Configuration section, a real example Action PR comment,
  a `--config` usage line, and a CI badge.
- 109 tests total, typecheck/lint/build all green.

## Test results (final)

```
Test Files  16 passed (16)
     Tests  109 passed (109)
```

`npm run typecheck`, `npm run lint`, and `npm run build` all pass with zero
warnings or errors.

## Architecture at a glance

Risk factors are independent pure functions (`PullRequestDiff` in,
`RiskFactor` out) combined by a weighted-average composite scorer. Git
plumbing (`git/`) and filesystem access (`fs/`) are isolated from the pure
scoring logic (`scoring/`), so almost everything is unit-testable without
touching disk or spawning a subprocess. The CLI and GitHub Action are both
thin callers of the same `analyze()` orchestration function — neither
reimplements scoring or reporting. See [PROGRESS.md](./PROGRESS.md) for the
full module layout and the design-principle rationale behind each of these
choices.

## Known limitations

- **Blast radius is a heuristic, not a real module resolver.** The
  dependency graph regex-scans `import`/`export ... from`/`require()`
  specifiers and only follows relative paths — bare package imports,
  dynamic `import()` with computed specifiers, and non-JS/TS callers
  (templates, other services) are invisible to it. The critical-path glob
  list exists specifically to catch some of what fan-in analysis alone
  would miss.
- **Test coverage correlation is filename-based.** A source file is
  considered "covered" if a same-named `*.test.ts`/`*.spec.ts` (or a file
  under a `test(s)`/`__tests__` directory) changed or exists — it doesn't
  parse the test file to confirm it actually imports/exercises the source
  file in question.
- **No rename detection.** `git diff --no-renames` is used deliberately to
  keep scoring simple (every change is a plain add/modify/delete), so a
  pure rename shows up as a delete + add rather than being scored as a
  low-risk move.
- **Single git provider.** `github-context.ts` and `comment.ts` are
  GitHub-specific; there's no GitLab/Bitbucket equivalent.
- **No persistent history.** Every run is a fresh analysis of one diff —
  there's no tracking of risk trends across a repo's PRs over time.

## Ideas for future work

- A real module-resolver-backed blast radius (e.g. shelling out to `tsc`'s
  program API or a bundler's graph) for accurate fan-in beyond relative
  imports.
- Historical trend tracking: store past `AnalysisResult`s (e.g. as a
  lightweight SQLite file or a GitHub Actions cache entry) to flag "this
  file's risk has been climbing over the last N PRs."
- A GitLab CI / Bitbucket Pipelines equivalent to the GitHub Action, reusing
  the same `analyze()` core.
- Config schema validation (e.g. reject unknown keys or wrong types in
  `.deployoraclerc.json` explicitly) instead of the current best-effort
  merge that silently ignores malformed section values.
- A `--fail-on <level>` CLI/Action flag to exit non-zero above a risk
  threshold, for use as a hard CI gate rather than just an informational
  comment.
