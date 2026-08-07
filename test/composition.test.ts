// ABOUTME: Tests for how a change is classified — typed at the keyboard, or arriving in a block.
// ABOUTME: Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classify,
  emptyComposition,
  foldChange,
  insertedShare,
} from "../src/core/composition";

const change = (inserted: number, removed = 0, multiline = false) => ({
  inserted,
  removed,
  multiline,
});

test("a single character is typing", () => {
  assert.equal(classify(change(1)), "typed");
});

test("an auto-closed bracket pair still counts as typing", () => {
  assert.equal(classify(change(2)), "typed");
});

test("a block of text is an insertion, whatever produced it", () => {
  assert.equal(classify(change(80)), "inserted");
});

test("a short multi-line change is an insertion, not typing", () => {
  // Pressing Enter inside a block inserts a newline plus indentation; that is
  // still a block arriving, and we do not try to guess further.
  assert.equal(classify(change(2, 0, true)), "inserted");
});

test("a deletion is neither typed nor inserted", () => {
  assert.equal(classify(change(0, 40)), "removed");
});

test("changes fold into running totals", () => {
  let composition = emptyComposition();
  composition = foldChange(composition, change(1));
  composition = foldChange(composition, change(1));
  composition = foldChange(composition, change(200, 0, true));
  composition = foldChange(composition, change(0, 12));
  assert.deepEqual(composition, { typedChars: 2, insertedChars: 200, removedChars: 12 });
});

test("the inserted share is undefined until something is written", () => {
  assert.equal(insertedShare(emptyComposition()), undefined);
  assert.equal(insertedShare({ typedChars: 0, insertedChars: 0, removedChars: 500 }), undefined);
});

test("the share counts written characters only, ignoring deletions", () => {
  const share = insertedShare({ typedChars: 25, insertedChars: 75, removedChars: 9999 });
  assert.equal(share, 0.75);
});
