# deploy-oracle

A deployment risk scoring tool. `deploy-oracle` analyzes a pull request —
files changed, blast radius, test coverage delta, and change size — and
outputs a deploy risk score with a recommended rollout strategy: canary
percentage, monitoring focus areas, and a rollback plan. It ships as a CLI
and, eventually, a GitHub Action that comments the score directly on PRs.

## Project Status

This project is under active, in-public, nightly development. See
[PROGRESS.md](./PROGRESS.md) for the architecture, the phased build plan,
and exactly where work resumes next.

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

| Level    | Canary  | Rollback posture                                      |
| -------- | ------- | ------------------------------------------------------ |
| low      | 100% (skip canary) | standard: revert if dashboards/alerts regress |
| medium   | 50%     | hold at canary until metrics look stable                |
| high     | 25%     | roll back at the first sign of regression               |
| critical | 5%      | notify on-call first; roll back within minutes          |

Monitoring focus areas are pulled from whichever individual risk factors
crossed an attention threshold (score ≥ 50), so the plan calls out *what* to
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
