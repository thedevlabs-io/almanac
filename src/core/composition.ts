/** One document change, reduced to the three things that say how it arrived. */
export interface Change {
  inserted: number;
  removed: number;
  multiline: boolean;
}

export type ChangeKind = "typed" | "block";

/**
 * A keystroke is small and stays on one line. Everything larger is a block: a
 * paste, a formatter, a refactor, a coding agent. Almanac reports the split and
 * stops there, because a paste and an agent's edit are the same API event and
 * guessing between them would be inventing data.
 */
const KEYSTROKE_MAX = 4;

export function classify(change: Change): ChangeKind {
  if (change.multiline) {
    return "block";
  }
  return change.inserted <= KEYSTROKE_MAX && change.removed <= KEYSTROKE_MAX ? "typed" : "block";
}

export interface Composition {
  /** Characters inserted one or two at a time, at a keyboard. */
  typedChars: number;
  /** Characters that arrived in blocks, from whatever source. */
  blockChars: number;
  /** How many separate block insertions there were, so average size is knowable. */
  blockCount: number;
}

export function emptyComposition(): Composition {
  return { typedChars: 0, blockChars: 0, blockCount: 0 };
}

export function foldChange(composition: Composition, change: Change): Composition {
  if (change.inserted <= 0) {
    return composition;
  }
  if (classify(change) === "typed") {
    return { ...composition, typedChars: composition.typedChars + change.inserted };
  }
  return {
    ...composition,
    blockChars: composition.blockChars + change.inserted,
    blockCount: composition.blockCount + 1,
  };
}

export function mergeComposition(a: Composition, b: Composition): Composition {
  return {
    typedChars: a.typedChars + b.typedChars,
    blockChars: a.blockChars + b.blockChars,
    blockCount: a.blockCount + b.blockCount,
  };
}

/** Share of inserted characters that were typed, 0 to 1. Zero writing reads as zero. */
export function typedShare(composition: Composition): number {
  const total = composition.typedChars + composition.blockChars;
  return total === 0 ? 0 : composition.typedChars / total;
}
