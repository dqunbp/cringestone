/** Resolve a public asset against the deployment base, keeping catalog paths portable. */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}
