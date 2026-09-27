# Progress

## Vision

deploy-oracle analyzes a pull request — files changed, blast radius, test
coverage delta, and change size — and outputs a deploy risk score with a
recommended rollout strategy: canary percentage, monitoring focus areas, and
a rollback plan. It ships as both a standalone CLI and a GitHub Action that
comments the score directly on the PR.

## Architecture

```
src/
  types/            Shared domain types (FileChange, PullRequestDiff, RiskFactor, RiskAssessment)
  git/
    diff-parser.ts   Pure parsing of `git diff --numstat` / `--name-status` output
    git-diff.ts       Shells out to git, returns a structured PullRequestDiff
  fs/
    repo-scanner.ts       Reads every source file in the repo into memory (path + content)
    coverage-report.ts    Reads & normalizes an Istanbul coverage-summary.json, if present
  scoring/
    change-size.ts        Risk factor: size of the change (files + lines touched)
    glob.ts                Tiny `*`/`**` glob-to-RegExp matcher (no dependency)
    dependency-graph.ts    Pure: builds a local import graph from source file contents
    blast-radius.ts        Risk factor: fan-in of changed files + critical-path glob matches
    test-coverage.ts       Risk factor: changed source files vs. changed/existing test files
    composite-scorer.ts   Combines weighted risk factors into one RiskAssessment
  rollout/
    recommend-rollout.ts  Pure: derives a RolloutStrategy from a RiskAssessment
  analyze.ts          Orchestrates: fetch diff + scan repo -> run all risk factors -> composite score -> rollout recommendation
  cli/
    index.ts          Commander-based CLI entrypoint (`deploy-oracle analyze`)
    report.ts          Formats an AnalysisResult as human-readable text
  index.ts             Library entrypoint (exports everything for programmatic use)
```

Design principles:
- **Risk factors are independent, pluggable units.** Each factor (change
  size, blast radius, coverage delta, ...) is a pure function that takes a
  `PullRequestDiff` and returns a `RiskFactor` (score + weight + explanation).
  The composite scorer just weight-averages whatever factors it's given, so
  new factors slot in without touching existing ones.
- **Git plumbing is separated from parsing.** `diff-parser.ts` has zero
  dependency on `child_process` and is pure-function testable; `git-diff.ts`
  is the only module that shells out. Renames are disabled
  (`--no-renames`) so every change is a plain add/modify/delete — simpler
  to score, revisited later if rename-aware scoring is worth the complexity.
- **Filesystem access is separated from analysis, the same way git is.**
  `fs/repo-scanner.ts` and `fs/coverage-report.ts` are the only modules that
  touch disk; they hand plain data (file path + content, a coverage map) to
  pure functions in `scoring/`, which stay unit-testable without touching a
  filesystem at all.
- **The import graph is a heuristic, not a real resolver.** `dependency-graph.ts`
  regex-scans for `import`/`export ... from`/`require()` specifiers rather
  than running a full TS/module resolver. It only follows relative
  specifiers (bare package imports are out of scope for blast radius) and
  handles both extensionless and explicit `.js`-on-`.ts` (NodeNext) import
  styles. Good enough for a risk signal; not a substitute for a real
  bundler's graph.
- **CLI is a thin shell over the library.** `analyze()` and the scoring
  functions are the real API; the CLI and (future) GitHub Action are both
  just callers of that API, so the same logic powers both surfaces.
- **Rollout recommendation is pure and separate from scoring.** Like the
  risk factors, `recommendRollout()` is a pure function (`RiskAssessment` in,
  `RolloutStrategy` out) with no knowledge of git, the filesystem, or the
  CLI. It reuses factor `id`s from `scoring/` as its only coupling point, so
  a new risk factor gets a generic monitoring callout for free and can add a
  factor-specific one later without touching the scoring code.

## Build Plan

### Phase 1 — Scaffold & core foundation (Night 1) ✅
- [x] TypeScript project scaffold: package.json, tsconfig, ESLint (flat
      config), Prettier, Vitest
- [x] Domain types: `FileChange`, `PullRequestDiff`, `RiskFactor`, `RiskAssessment`
- [x] Git diff parsing: pure parsers for `--numstat` / `--name-status`, merged
      into `FileChange[]`
- [x] Git integration: `getPullRequestDiff()` shells out to `git diff` between
      two refs (or a ref and the working tree)
- [x] First risk factor: change-size scoring (files touched + lines churned,
      saturating thresholds)
- [x] Composite scorer: weighted average of factors -> score (0-100) + level
      (low/medium/high/critical)
- [x] `analyze()` orchestration function wiring diff-fetch -> scoring
- [x] CLI: `deploy-oracle analyze [--base <ref>] [--head <ref>] [--json]`
- [x] Tests for every module above (32 tests: unit + integration against real
      temp git repos), typecheck, lint, and build all green

### Phase 2 — Blast radius & test coverage delta (Night 2) ✅
- [x] Blast-radius risk factor: regex-based import/dependency graph analysis
      (`dependency-graph.ts`) to detect changes touching widely-depended-on
      files, plus a configurable list of "critical path" globs (auth,
      payments, billing, migrations, security, config) via a small
      dependency-free glob matcher (`glob.ts`)
- [x] Test coverage delta risk factor: correlates changed source files
      against test files changed in the same diff and existing test files
      in the repo, with optional Istanbul `coverage-summary.json` support to
      catch existing-but-poorly-covered files
- [x] `fs/repo-scanner.ts` and `fs/coverage-report.ts`: the only two modules
      that touch the filesystem for these factors, mirroring how git-diff.ts
      isolates git plumbing from pure parsing
- [x] Wired both new factors into `analyze()` alongside change-size
- [x] Tests for both factors (pure, fixture-based) plus the fs helpers
      (temp-dir based, like the existing git integration tests) — 72 tests
      total, typecheck/lint/build all green

### Phase 3 — Rollout strategy recommendation (Night 3) ✅
- [x] `RolloutStrategy` type: canary percentage, `skipCanary` flag,
      monitoring focus areas, rollback plan (`types/rollout.ts`)
- [x] `recommendRollout(assessment)`: pure recommendation engine
      (`rollout/recommend-rollout.ts`). Canary size + rollback plan come
      from the overall level (low -> 100%/skip, critical -> 5% + notify
      on-call); monitoring focus areas are pulled per-factor for any factor
      scoring >= 50, with factor-specific phrasing for `change-size`,
      `blast-radius`, and `test-coverage`, and a generic fallback for
      unrecognized factor ids
- [x] Wired into `analyze()` -> `AnalysisResult.rollout`; surfaced in both
      `cli/report.ts` (plain-text "Rollout strategy" section) and `--json`
      output (part of the serialized `AnalysisResult`)
- [x] Tests across all four risk levels, the no-factors-triggered fallback,
      all-factors-maxed case, and each recognized + an unrecognized factor
      id (10 tests) — 84 tests total, typecheck/lint/build all green

### Phase 4 — GitHub Action (Night 4)
- [ ] Package the CLI as a GitHub Action (composite or JS action)
- [ ] Action reads the PR's base/head via the GitHub Actions context, runs
      `analyze()`, and posts/updates a single PR comment with the report
- [ ] End-to-end test / example workflow in `.github/workflows/`

### Phase 5 — Polish (Night 5+)
- [ ] Config file support (`.deployoraclerc` or similar) for thresholds,
      critical-path globs, and weight tuning
- [ ] Expanded README with real example output and Action usage docs
- [ ] CI workflow running lint/typecheck/test on every push

## Resume Point

**Start here tomorrow night:** Phase 4, the GitHub Action. Read
`src/cli/index.ts` and `src/analyze.ts` first — the Action wraps the same
`analyze()` call the CLI already makes, just with `base`/`head` sourced from
the GitHub Actions event context (`GITHUB_BASE_REF`/`GITHUB_SHA` or the
`pull_request` event payload) instead of CLI flags, and posts/updates a
single PR comment with `formatReport()`'s output (or a Markdown variant of
it) instead of printing to stdout. No design decisions are pending on the
scoring/rollout side — `AnalysisResult` (diff + assessment + rollout) is
stable and is exactly what the Action needs to render. Decide during Phase 4
whether the Action is a thin JS action (`@actions/core` + `@actions/github`,
reusing the built `dist/`) or a composite action that shells out to the
CLI; the JS action is likely simpler since it can call `analyze()` and the
comment-formatting logic directly without spawning a subprocess.

STATUS: IN_PROGRESS
