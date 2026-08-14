export type RepositoryWorldsV2LabEnvironment = Readonly<{
  nodeEnvironment?: string;
  vercelEnvironment?: string;
  explicitFlag?: string;
}>;

export function isRepositoryWorldsV2LabEnabled(
  environment: RepositoryWorldsV2LabEnvironment,
): boolean {
  return (
    environment.nodeEnvironment === "development" ||
    environment.vercelEnvironment === "preview" ||
    environment.explicitFlag === "1"
  );
}
