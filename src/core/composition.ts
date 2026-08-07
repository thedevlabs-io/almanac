// ABOUTME: Classifies how text arrived — typed one key at a time, or inserted in a block.
// ABOUTME: Deliberately NOT "AI vs human": nothing available to an extension can tell those apart.

/** A single content change, reduced to what we can honestly measure. */
export interface Change {
  /** Characters inserted by this change. */
  inserted: number;
  /** Characters replaced or deleted. */
  removed: number;
  /** True when the change spans more than one line. */
  multiline: boolean;
}

export type Kind = "typed" | "inserted" | "removed";

/**
 * A keystroke inserts one character, or two with an auto-closed bracket; an
 * autocomplete accept, a paste, an agent edit and a refactor all land as a block.
 *
 * We cannot separate those four, so we don't pretend to: everything over the
 * keystroke threshold is "inserted", and the dashboard says exactly that.
 */
export const TYPED_MAX_CHARS = 2;

export function classify(change: Change): Kind {
  if (change.inserted === 0) {
    return "removed";
  }
  return change.inserted <= TYPED_MAX_CHARS && !change.multiline ? "typed" : "inserted";
}

export interface Composition {
  typedChars: number;
  insertedChars: number;
  removedChars: number;
}

export function emptyComposition(): Composition {
  return { typedChars: 0, insertedChars: 0, removedChars: 0 };
}

export function foldChange(into: Composition, change: Change): Composition {
  const kind = classify(change);
  return {
    typedChars: into.typedChars + (kind === "typed" ? change.inserted : 0),
    insertedChars: into.insertedChars + (kind === "inserted" ? change.inserted : 0),
    removedChars: into.removedChars + change.removed,
  };
}

/**
 * Share of *written* characters that arrived in blocks, 0–1. Undefined when
 * nothing has been written, so the UI can say "not enough to tell" rather than
 * showing a confident 0%.
 */
export function insertedShare(composition: Composition): number | undefined {
  const written = composition.typedChars + composition.insertedChars;
  return written === 0 ? undefined : composition.insertedChars / written;
}
