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
Risk score: 3/100 (LOW)

Factors:
  - Change size: 3/100 — 1 file changed, 3 lines touched
```

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
