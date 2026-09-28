import { describe, expect, it } from 'vitest';
import { resolveActionContext } from './github-context.js';

const PR_EVENT = JSON.stringify({
  pull_request: {
    number: 42,
    base: { sha: 'base-sha' },
    head: { sha: 'head-sha' },
  },
});

describe('resolveActionContext', () => {
  it('throws when GITHUB_REPOSITORY is missing', async () => {
    await expect(resolveActionContext({ env: {} })).rejects.toThrow('GITHUB_REPOSITORY');
  });

  it('reads base, head, and PR number from a pull_request event payload', async () => {
    const context = await resolveActionContext({
      env: { GITHUB_REPOSITORY: 'acme/widgets', GITHUB_EVENT_PATH: '/tmp/event.json' },
      readEventPayload: async () => PR_EVENT,
    });

    expect(context).toEqual({
      owner: 'acme',
      repo: 'widgets',
      base: 'base-sha',
      head: 'head-sha',
      prNumber: 42,
    });
  });

  it('prefers explicit INPUT_BASE/INPUT_HEAD over the event payload', async () => {
    const context = await resolveActionContext({
      env: {
        GITHUB_REPOSITORY: 'acme/widgets',
        GITHUB_EVENT_PATH: '/tmp/event.json',
        INPUT_BASE: 'main',
        INPUT_HEAD: 'feature',
      },
      readEventPayload: async () => PR_EVENT,
    });

    expect(context.base).toBe('main');
    expect(context.head).toBe('feature');
    expect(context.prNumber).toBe(42);
  });

  it('falls back to GITHUB_BASE_REF and omits head/prNumber when there is no event', async () => {
    const context = await resolveActionContext({
      env: { GITHUB_REPOSITORY: 'acme/widgets', GITHUB_BASE_REF: 'main' },
    });

    expect(context).toEqual({ owner: 'acme', repo: 'widgets', base: 'main' });
  });

  it('throws when no base can be determined', async () => {
    await expect(
      resolveActionContext({ env: { GITHUB_REPOSITORY: 'acme/widgets' } }),
    ).rejects.toThrow('Could not determine a base ref');
  });

  it('ignores an unparseable event payload and falls back to GITHUB_BASE_REF', async () => {
    const context = await resolveActionContext({
      env: {
        GITHUB_REPOSITORY: 'acme/widgets',
        GITHUB_EVENT_PATH: '/tmp/event.json',
        GITHUB_BASE_REF: 'main',
      },
      readEventPayload: async () => 'not json',
    });

    expect(context).toEqual({ owner: 'acme', repo: 'widgets', base: 'main' });
  });
});
