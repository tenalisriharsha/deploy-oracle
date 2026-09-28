const COMMENT_MARKER = '<!-- deploy-oracle:report -->';

interface GitHubComment {
  id: number;
  body: string;
}

export interface UpsertReportCommentOptions {
  token: string;
  owner: string;
  repo: string;
  issueNumber: number;
  body: string;
  fetchImpl?: typeof fetch;
}

function apiHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'deploy-oracle-action',
  };
}

/**
 * Creates or updates the single deploy-oracle report comment on a PR, keyed
 * by a hidden HTML marker in the comment body. This keeps re-runs (e.g. a
 * new push to the PR) editing the existing comment instead of piling up a
 * new one every time.
 */
export async function upsertReportComment(options: UpsertReportCommentOptions): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = `https://api.github.com/repos/${options.owner}/${options.repo}`;
  const body = `${COMMENT_MARKER}\n${options.body}`;

  const listResponse = await fetchImpl(
    `${baseUrl}/issues/${options.issueNumber}/comments?per_page=100`,
    { headers: apiHeaders(options.token) },
  );
  if (!listResponse.ok) {
    throw new Error(
      `Failed to list PR comments: ${listResponse.status} ${await listResponse.text()}`,
    );
  }
  const comments = (await listResponse.json()) as GitHubComment[];
  const existing = comments.find((comment) => comment.body.includes(COMMENT_MARKER));

  const response = existing
    ? await fetchImpl(`${baseUrl}/issues/comments/${existing.id}`, {
        method: 'PATCH',
        headers: apiHeaders(options.token),
        body: JSON.stringify({ body }),
      })
    : await fetchImpl(`${baseUrl}/issues/${options.issueNumber}/comments`, {
        method: 'POST',
        headers: apiHeaders(options.token),
        body: JSON.stringify({ body }),
      });

  if (!response.ok) {
    const action = existing ? 'update' : 'create';
    throw new Error(`Failed to ${action} PR comment: ${response.status} ${await response.text()}`);
  }
}
