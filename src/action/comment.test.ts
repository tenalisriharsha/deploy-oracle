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

  it('finds the marker comment beyond the first page and edits it instead of posting a duplicate', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      body: `unrelated comment ${i + 1}`,
    }));
    const page2 = [{ id: 101, body: '<!-- deploy-oracle:report -->\nold report' }];

    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const urlString = url.toString();
      if (urlString.includes('?')) {
        const page = Number(new URL(urlString).searchParams.get('page') ?? '1');
        if (page === 1) return jsonResponse(page1);
        if (page === 2) return jsonResponse(page2);
        return jsonResponse([]);
      }
      return jsonResponse({ id: 101 });
    }) as unknown as typeof fetch;

    await upsertReportComment({ ...BASE_OPTIONS, fetchImpl });

    const mockCalls = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls;
    const listingCalls = mockCalls.filter(([url]) => url.includes('?'));
    expect(listingCalls.length).toBeGreaterThan(1);

    const [finalUrl, finalInit] = mockCalls[mockCalls.length - 1]!;
    expect(finalUrl).toBe('https://api.github.com/repos/acme/widgets/issues/comments/101');
    expect(finalInit.method).toBe('PATCH');
  });
});
