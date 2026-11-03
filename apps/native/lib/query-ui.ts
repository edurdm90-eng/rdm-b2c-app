/** Full-screen loaders only when there is no cached/previous data yet. */
export function shouldShowInitialQueryLoader(hasData: boolean, isPending: boolean) {
  return !hasData && isPending;
}
