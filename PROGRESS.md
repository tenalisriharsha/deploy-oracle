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
  scoring/
    change-size.ts        Risk factor: size of the change (files + lines touched)
    composite-scorer.ts   Combines weighted risk factors into one RiskAssessment
  analyze.ts          Orchestrates: fetch diff -> run all risk factors -> composite score
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
- **CLI is a thin shell over the library.** `analyze()` and the scoring
  functions are the real API; the CLI and (future) GitHub Action are both
  just callers of that API, so the same logic powers both surfaces.

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

### Phase 2 — Blast radius & test coverage delta (Night 2)
- [ ] Blast-radius risk factor: static import/dependency graph analysis to
      detect changes touching widely-depended-on files, plus a configurable
      list of "critical path" globs (auth, payments, migrations, config)
- [ ] Test coverage delta risk factor: correlate changed source files against
      changed/existing test files and (if available) a coverage report, to
      flag risky changes with no corresponding test movement
- [ ] Wire both new factors into `analyze()` alongside change-size
- [ ] Tests for both factors, including fixtures with real dependency graphs

### Phase 3 — Rollout strategy recommendation (Night 3)
- [ ] `RolloutStrategy` type: canary percentage, monitoring focus areas,
      rollback plan
- [ ] Recommendation engine deriving a strategy from the composite
      `RiskAssessment` (e.g. low risk -> 100%/skip canary, critical -> small
      canary + specific monitoring areas pulled from the triggering factors)
- [ ] Surface the recommendation in the CLI report and `--json` output
- [ ] Tests across risk levels and edge cases (no factors, all factors maxed)

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

**Start here tomorrow night:** Phase 2, blast-radius risk factor. Read
`src/scoring/change-size.ts` and `src/scoring/composite-scorer.ts` first —
new factors follow the exact same `RiskFactor`-returning shape and get added
to the array in `src/analyze.ts`. No design decisions are pending; the
factor interface is already stable from Phase 1.

STATUS: IN_PROGRESS
