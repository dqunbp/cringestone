const preference = typeof window === 'undefined' ? null : window.matchMedia('(prefers-reduced-motion: reduce)');

export function prefersReducedMotion(): boolean {
  return preference?.matches ?? false;
}
