import { readFile } from 'node:fs/promises';

export interface ActionContext {
  owner: string;
  repo: string;
  base: string;
  head?: string;
  prNumber?: number;
}

interface PullRequestEvent {
  pull_request?: {
    number: number;
    base: { sha: string };
    head: { sha: string };
  };
}

export interface ResolveActionContextOptions {
  env: NodeJS.ProcessEnv;
  readEventPayload?: (path: string) => Promise<string>;
}

/**
 * Resolves the base/head to diff and, when present, the pull request to
 * comment on. Explicit `base`/`head` inputs (`INPUT_BASE`/`INPUT_HEAD`) win
 * over the triggering event, so the action works unmodified on a
 * `pull_request` trigger while still being overridable for other triggers
 * (e.g. `workflow_dispatch` against arbitrary refs).
 */
export async function resolveActionContext(
  options: ResolveActionContextOptions,
): Promise<ActionContext> {
  const { env } = options;
  const readEventPayload = options.readEventPayload ?? ((path: string) => readFile(path, 'utf8'));

  const [owner, repo] = (env.GITHUB_REPOSITORY ?? '').split('/');
  if (!owner || !repo) {
    throw new Error('GITHUB_REPOSITORY is not set (expected "owner/repo").');
  }

  let event: PullRequestEvent = {};
  if (env.GITHUB_EVENT_PATH) {
    try {
      event = JSON.parse(await readEventPayload(env.GITHUB_EVENT_PATH)) as PullRequestEvent;
    } catch {
      event = {};
    }
  }

  const base =
    nonEmpty(env.INPUT_BASE) ?? event.pull_request?.base.sha ?? nonEmpty(env.GITHUB_BASE_REF);
  const head = nonEmpty(env.INPUT_HEAD) ?? event.pull_request?.head.sha;

  if (!base) {
    throw new Error(
      'Could not determine a base ref to diff against. Set the "base" input or run this action on a pull_request event.',
    );
  }

  return {
    owner,
    repo,
    base,
    ...(head ? { head } : {}),
    ...(event.pull_request ? { prNumber: event.pull_request.number } : {}),
  };
}

function nonEmpty(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value : undefined;
}
