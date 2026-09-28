import { describe, expect, it, vi } from 'vitest';
import { upsertReportComment } from './comment.js';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

const BASE_OPTIONS = {
  token: 'gh-token',
  owner: 'acme',
  repo: 'widgets',
  issueNumber: 7,
  body: '### report',
};

describe('upsertReportComment', () => {
  it('creates a new comment when no marked comment exists', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ id: 1 }));

    await upsertReportComment({ ...BASE_OPTIONS, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [createUrl, createInit] = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(createUrl).toBe('https://api.github.com/repos/acme/widgets/issues/7/comments');
    expect(createInit.method).toBe('POST');
    expect(createInit.body).toContain('<!-- deploy-oracle:report -->');
    expect(createInit.body).toContain('### report');
  });

  it('updates the existing marked comment instead of creating a new one', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse([
          { id: 99, body: 'unrelated comment' },
          { id: 5, body: '<!-- deploy-oracle:report -->\nold report' },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse({ id: 5 }));

    await upsertReportComment({ ...BASE_OPTIONS, fetchImpl });

    const [updateUrl, updateInit] = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(updateUrl).toBe('https://api.github.com/repos/acme/widgets/issues/comments/5');
    expect(updateInit.method).toBe('PATCH');
  });

  it('throws when listing comments fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ message: 'nope' }, false, 403));

    await expect(upsertReportComment({ ...BASE_OPTIONS, fetchImpl })).rejects.toThrow(
      'Failed to list PR comments: 403',
    );
  });

  it('throws when creating the comment fails', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ message: 'nope' }, false, 422));

    await expect(upsertReportComment({ ...BASE_OPTIONS, fetchImpl })).rejects.toThrow(
      'Failed to create PR comment: 422',
    );
  });
});
