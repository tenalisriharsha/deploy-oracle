export type ChangeStatus = 'added' | 'modified' | 'deleted' | 'unknown';

export interface FileChange {
  path: string;
  status: ChangeStatus;
  additions: number;
  deletions: number;
  binary: boolean;
}

export interface PullRequestDiff {
  base: string;
  head: string;
  files: FileChange[];
}
