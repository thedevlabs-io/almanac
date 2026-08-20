import { strict as assert } from "node:assert";
import { test } from "node:test";
import { classify, emptyComposition, foldChange, mergeComposition, typedShare } from "../src/core/composition";

test("a keystroke sized single line change is typing", () => {
  assert.equal(classify({ inserted: 1, removed: 0, multiline: false }), "typed");
  assert.equal(classify({ inserted: 0, removed: 1, multiline: false }), "typed");
  assert.equal(classify({ inserted: 4, removed: 0, multiline: false }), "typed");
});

test("anything multiline or larger than a keystroke is a block", () => {
  assert.equal(classify({ inserted: 1, removed: 0, multiline: true }), "block");
  assert.equal(classify({ inserted: 5, removed: 0, multiline: false }), "block");
  assert.equal(classify({ inserted: 0, removed: 500, multiline: false }), "block");
});

test("folding accumulates typed characters and block counts separately", () => {
  let composition = emptyComposition();
  composition = foldChange(composition, { inserted: 1, removed: 0, multiline: false });
  composition = foldChange(composition, { inserted: 3, removed: 0, multiline: false });
  composition = foldChange(composition, { inserted: 400, removed: 0, multiline: true });

  assert.deepEqual(composition, { typedChars: 4, blockChars: 400, blockCount: 1 });
});

test("a pure deletion changes nothing, since nothing was written", () => {
  const composition = foldChange(emptyComposition(), { inserted: 0, removed: 80, multiline: true });
  assert.deepEqual(composition, emptyComposition());
});

test("the typed share is zero when nothing was written at all", () => {
  assert.equal(typedShare(emptyComposition()), 0);
  assert.equal(typedShare({ typedChars: 1, blockChars: 3, blockCount: 1 }), 0.25);
});

test("merging adds every field", () => {
  assert.deepEqual(
    mergeComposition({ typedChars: 1, blockChars: 2, blockCount: 3 }, { typedChars: 10, blockChars: 20, blockCount: 30 }),
    { typedChars: 11, blockChars: 22, blockCount: 33 }
  );
});
