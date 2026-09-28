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
    report.ts          Formats an AnalysisResult as human-readable text or GitHub-flavored Markdown
  action/
    github-context.ts   Resolves base/head refs + PR number from Action env vars and the event payload
    comment.ts           Creates/updates the single marked PR comment via the GitHub REST API (native fetch)
    index.ts              Action entrypoint: analyze() -> log report -> upsert PR comment
  index.ts             Library entrypoint (exports everything for programmatic use)
```

Root also has `action.yml` (a composite action: installs deps, builds, runs
`dist/action/index.js`) and `.github/workflows/deploy-oracle.yml` (runs the
action on this repo's own PRs — the end-to-end test for Phase 4).

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
- **The Action is a thin caller of the same `analyze()`, like the CLI.**
  `action/index.ts` doesn't reimplement anything: it resolves `base`/`head`
  from GitHub's event payload, calls `analyze()`, and hands the result to
  `formatMarkdownReport()`. No PR context (e.g. a non-`pull_request` trigger)
  just means the comment step is skipped — the report still prints to the
  job log either way, so the action degrades instead of failing.
- **The Action posts a comment with zero extra runtime dependencies.**
  `action/comment.ts` talks to the GitHub REST API with Node's built-in
  `fetch` rather than adding `@actions/core`/`@actions/github` (or an
  Octokit client) as a dependency — one hidden HTML marker in the comment
  body is enough to find-and-update the same comment on every re-run instead
  of relying on a client library's pagination/auth helpers.
- **The action ships as a composite action, not a bundled JS action.** The
  project has no bundler (just `tsc`), and `dist/` is gitignored like any
  other build artifact. Rather than introduce a bundler solely to commit a
  single-file `dist/action/index.js`, `action.yml` runs `npm ci && npm run
build` against its own checkout (`github.action_path`) before invoking the
  built entrypoint — a few extra seconds per run in exchange for reusing the
  exact same build as the CLI/library and not needing to special-case what
  gets committed.

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

### Phase 4 — GitHub Action (Night 4) ✅

- [x] Packaged as a composite action (`action.yml` at repo root): installs
      deps + builds against its own checkout, then runs
      `dist/action/index.js`. No bundler needed since the analysis code path
      (`analyze.js` and everything it imports) has zero runtime npm
      dependencies — only the CLI depends on `commander`.
- [x] `action/github-context.ts` resolves base/head + PR number from
      `INPUT_BASE`/`INPUT_HEAD` (explicit inputs win) or the `pull_request`
      event payload (`GITHUB_EVENT_PATH`), falling back to `GITHUB_BASE_REF`
      when there's no event; throws only if no base can be determined at all
- [x] `action/index.ts` calls the same `analyze()` the CLI uses (scoped to
      `GITHUB_WORKSPACE`), always logs the plain-text report, and — only
      when a PR number and a token are both available — posts/updates a
      Markdown report comment via `action/comment.ts`
- [x] `action/comment.ts` upserts a single PR comment (find-by-hidden-marker,
      PATCH if found else POST) using Node's built-in `fetch` against the
      GitHub REST API directly — no Octokit/`@actions/*` dependency
- [x] `cli/report.ts` gained `formatMarkdownReport()` (GitHub-flavored
      Markdown table of factors + rollout section) alongside the existing
      plain-text `formatReport()`
- [x] End-to-end/example workflow at `.github/workflows/deploy-oracle.yml`:
      runs the action on this repo's own pull requests via `uses: ./`
- [x] Tests for `github-context.ts` (6) and `comment.ts` (4, mocked
      `fetch`) plus `formatMarkdownReport` (7) — 101 tests total,
      typecheck/lint/build all green; manually smoke-tested the built
      `dist/action/index.js` end-to-end (with and without PR context)

### Phase 5 — Polish (Night 5+)

- [ ] Config file support (`.deployoraclerc` or similar) for thresholds,
      critical-path globs, and weight tuning
- [ ] Expanded README with real example output and Action usage docs
- [ ] CI workflow running lint/typecheck/test on every push

## Resume Point

**Start here tomorrow night:** Phase 5, polish. Nothing is blocked or
half-finished — all four phases so far are done, tested, and wired
end-to-end (CLI and Action both call the same `analyze()`). Phase 5 items,
roughly in priority order:

1. **Config file support** (`.deployoraclerc.json` or similar): let a repo
   tune change-size thresholds, the blast-radius critical-path glob list,
   and factor weights without editing source. Look at
   `scoring/composite-scorer.ts` (factor weights), `scoring/change-size.ts`
   (thresholds), and `scoring/blast-radius.ts` (the hardcoded critical-path
   globs) for what should become configurable. `analyze()` would need an
   optional config param threaded through to whichever scoring functions
   read it; the CLI would load the file from `cwd` and the Action would need
   nothing extra since it already resolves `cwd` to `GITHUB_WORKSPACE`.
2. **CI workflow** running lint/typecheck/test on every push/PR
   (`.github/workflows/ci.yml` — doesn't exist yet; only the Action's own
   dogfooding workflow does). Straightforward, no design decisions pending.
3. **README polish**: real example Action comment output (screenshot or
   pasted Markdown), and a note on the config file once it exists.

No design decisions are pending from Phase 4 — the Action is a real,
working composite action, dogfooding itself in
`.github/workflows/deploy-oracle.yml` on this repo's own PRs.

STATUS: IN_PROGRESS
