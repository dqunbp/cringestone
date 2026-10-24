/** Xorshift32: state is serialized with the match, never taken from the clock. */
export function randomStep(state: number): number {
  let value = state >>> 0 || 0x9e3779b9;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

export function shuffle<T>(items: T[], source: { rngState: number }): void {
  for (let index = items.length - 1; index > 0; index -= 1) {
    source.rngState = randomStep(source.rngState);
    const other = Math.floor((source.rngState / 0x100000000) * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
}
