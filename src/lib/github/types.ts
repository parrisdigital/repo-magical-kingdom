export type RepositoryReference = Readonly<{
  owner: string;
  repository: string;
  revision?: string;
}>;

export type SourceFile = Readonly<{
  path: string;
  size: number;
  sha: string;
}>;

export type RelatedRepository = Readonly<{
  id: number;
  owner: string;
  repository: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  updatedAt: string;
  defaultBranch: string;
  canonicalUrl: string;
}>;

export type RepositorySnapshot = Readonly<{
  repositoryId: number;
  owner: string;
  repository: string;
  description: string | null;
  defaultBranch: string;
  commitSha: string;
  commitTreeSha: string;
  committedAt: string;
  canonicalUrl: string;
  license: string | null;
  files: ReadonlyArray<SourceFile>;
  treeTruncated: boolean;
  treeRecovered: boolean;
  relatedRepositories: ReadonlyArray<RelatedRepository>;
  warnings: ReadonlyArray<Readonly<{ code: string; message: string }>>;
}>;

export type ProfileRepository = Readonly<{
  id: number;
  owner: string;
  repository: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  updatedAt: string;
  defaultBranch: string;
  license: string | null;
  canonicalUrl: string;
}>;

export type ProfileSnapshot = Readonly<{
  owner: string;
  displayName: string;
  avatarUrl: string;
  profileUrl: string;
  publicRepositoryCount: number;
  repositories: ReadonlyArray<ProfileRepository>;
  truncated: boolean;
}>;
