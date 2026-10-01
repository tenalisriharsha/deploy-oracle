# deploy-oracle

[![CI](https://github.com/tenalisriharsha/deploy-oracle/actions/workflows/ci.yml/badge.svg)](https://github.com/tenalisriharsha/deploy-oracle/actions/workflows/ci.yml)

A deployment risk scoring tool. `deploy-oracle` analyzes a pull request —
files changed, blast radius, test coverage delta, and change size — and
outputs a deploy risk score with a recommended rollout strategy: canary
percentage, monitoring focus areas, and a rollback plan. It ships as both a
CLI and a GitHub Action that comments the score directly on PRs.

## Preview

What lands on the PR — the real markdown the formatter produces, rendered
the way GitHub displays it:

![The deploy-oracle report as a PR comment: risk table and rollout strategy](docs/screenshots/05-pr-comment.png)

<details>
<summary>More views</summary>

![analyze: a genuinely HIGH-risk diff from this repo's own history](docs/screenshots/01-analyze-high.png)

![analyze: a genuinely LOW-risk, docs-only diff for contrast](docs/screenshots/02-analyze-low.png)

![analyze --json: the same engine that powers the PR comment](docs/screenshots/03-json.png)

![--help](docs/screenshots/04-help.png)

![A config file reweighting the same diff from HIGH (59) to CRITICAL (78)](docs/screenshots/06-custom-config.png)

</details>

## Project Status

Feature-complete: all planned phases (scoring engine, blast radius, test
coverage delta, rollout recommendations, the GitHub Action, config file
support, CI) are done, tested, and wired end-to-end. See
[PROGRESS.md](./PROGRESS.md) for the architecture and phased build history,
and [DAILY_REPORT.md](./DAILY_REPORT.md) for a summary of what was built
each night.

## Usage (CLI)

```sh
npm install
npm run build

# Score the working tree against HEAD
node dist/cli/index.js analyze

# Score one ref against another, e.g. in CI: base branch vs. PR head
node dist/cli/index.js analyze --base main --head HEAD

# Machine-readable output
node dist/cli/index.js analyze --json

# Use a config file at a non-default path
node dist/cli/index.js analyze --config risk-config.json
```

Example output:

```
Deploy Oracle risk report (HEAD -> working-tree)
Risk score: 55/100 (HIGH)

Factors:
  - Change size: 23/100 — 7 files changed, 58 lines touched
  - Blast radius: 93/100 — src/types/index.ts has 14 known dependents
  - Test coverage delta: 50/100 — 2/4 changed files with no test coverage (src/index.ts, src/types/index.ts)

Rollout strategy:
  Canary: 25% first
  Monitor:
    - Blast radius is elevated (93/100) — src/types/index.ts has 14 known dependents. Monitor the downstream consumers of the changed files closely.
    - Test coverage delta is elevated (50/100) — 2/4 changed files with no test coverage (src/index.ts, src/types/index.ts). Monitor for regressions in the paths that shipped without test updates.
  Rollback: Keep the previous version ready to restore; roll back at the first sign of regression rather than waiting out the full canary window.
```

## Usage (GitHub Action)

Add it to a workflow that checks out the PR with full history (the action
needs to diff against the actual base commit, which a shallow checkout
won't have):

```yaml
name: Deploy Oracle
on:
  pull_request:
    branches: [main]

permissions:
  contents: read
  pull-requests: write

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: tenalisriharsha/deploy-oracle@main
```

On a `pull_request` event the action diffs the PR's base and head commits
automatically and posts the report as a PR comment, editing that same
comment on subsequent pushes instead of piling up duplicates. Inputs:

| Input   | Required | Default               | Description                             |
| ------- | -------- | --------------------- | --------------------------------------- |
| `base`  | no       | the PR's base commit  | Ref/sha to diff against                 |
| `head`  | no       | the PR's head commit  | Ref/sha to diff                         |
| `token` | no       | `${{ github.token }}` | Token used to read and post the comment |

If the action isn't running on a `pull_request` event (or `base` can't be
resolved another way), set `base`/`head` explicitly; the report still
prints to the job log even when there's no PR to comment on.

Example PR comment:

> ### Deploy Oracle risk report
> **Risk score:** 55/100 (HIGH)
>
> _Diffing `main` → `a1b2c3d`_
>
> | Factor | Score | Detail |
> | --- | --- | --- |
> | Change size | 23/100 | 7 files changed, 58 lines touched |
> | Blast radius | 93/100 | src/types/index.ts has 14 known dependents |
> | Test coverage delta | 50/100 | 2/4 changed files with no test coverage (src/index.ts, src/types/index.ts) |
>
> **Rollout strategy**
> - Canary: 25% first
> - Monitor:
>   - Blast radius is elevated (93/100) — src/types/index.ts has 14 known dependents. Monitor the downstream consumers of the changed files closely.
>   - Test coverage delta is elevated (50/100) — 2/4 changed files with no test coverage (src/index.ts, src/types/index.ts). Monitor for regressions in the paths that shipped without test updates.
> - Rollback: Keep the previous version ready to restore; roll back at the first sign of regression rather than waiting out the full canary window.

The action edits this same comment (matched via a hidden HTML marker) on
every subsequent push to the PR, instead of piling up a new one each time.

## Configuration

Drop a `.deployoraclerc.json` in the repo root to tune thresholds, the
critical-path glob list, and per-factor weights without touching source.
Every field is optional — anything you omit falls back to its default:

```json
{
  "changeSize": {
    "maxFiles": 30,
    "maxLines": 1000
  },
  "blastRadius": {
    "maxDependents": 15,
    "criticalPathGlobs": ["**/auth/**", "**/*payment*", "**/migrations/**"]
  },
  "testCoverage": {
    "lowCoverageThreshold": 50
  },
  "weights": {
    "change-size": 1,
    "blast-radius": 2,
    "test-coverage": 1
  }
}
```

- `changeSize.maxFiles` / `changeSize.maxLines` — file/line counts at which
  the change-size factor saturates at 100.
- `blastRadius.maxDependents` — known-dependent count at which the fan-in
  score saturates at 100.
- `blastRadius.criticalPathGlobs` — replaces (not merges with) the default
  glob list; any changed file matching one of these scores 100 regardless of
  fan-in.
- `testCoverage.lowCoverageThreshold` — line-coverage percentage (from an
  Istanbul `coverage-summary.json`, if present) below which an existing test
  is treated as insufficient.
- `weights` — overrides a risk factor's contribution to the overall score,
  keyed by factor id (`change-size`, `blast-radius`, `test-coverage`).
  Defaults to `1` for every factor; `0` excludes a factor from the score
  entirely while still showing it in the report.

The CLI loads this file from `cwd` automatically (override the path with
`--config <path>`); the Action needs nothing extra since it already resolves
`cwd` to `GITHUB_WORKSPACE`. A present-but-invalid config file fails loudly
rather than silently falling back to defaults.

## Risk factors

- **Change size** — files touched + lines churned, saturating past a
  configurable threshold. Bigger diffs are harder to review carefully.
- **Blast radius** — builds a local import graph (regex-based, resolves
  relative `import`/`require` specifiers) and flags changed files with many
  known dependents. Also flags any changed file matching a configurable
  critical-path glob list (auth, payments, billing, migrations, security,
  config) as high risk regardless of fan-in, since static analysis alone
  can't see every caller.
- **Test coverage delta** — correlates each changed source file against
  test files changed in the same diff and existing test files in the repo.
  A source change with no corresponding test anywhere is the highest risk;
  an existing-but-unchanged test is a middling risk. If an Istanbul-style
  `coverage/coverage-summary.json` report is present, low reported line
  coverage on a file is treated the same as having no test at all.

## Rollout strategy

Every analysis also produces a `RolloutStrategy`: a canary percentage, a
rollback plan, and a list of monitoring focus areas. Canary sizing and the
rollback plan follow the overall risk level:

| Level    | Canary             | Rollback posture                               |
| -------- | ------------------ | ---------------------------------------------- |
| low      | 100% (skip canary) | standard: revert if dashboards/alerts regress  |
| medium   | 50%                | hold at canary until metrics look stable       |
| high     | 25%                | roll back at the first sign of regression      |
| critical | 5%                 | notify on-call first; roll back within minutes |

Monitoring focus areas are pulled from whichever individual risk factors
crossed an attention threshold (score ≥ 50), so the plan calls out _what_ to
watch — e.g. "blast radius is elevated, monitor the downstream consumers of
`src/auth/login.ts` closely" — rather than just how carefully to watch it.

## Development

```sh
npm install
npm test         # run the test suite
npm run typecheck
npm run lint
npm run build
```

## License

MIT
