import assert from "node:assert/strict";
import test from "node:test";

import {
  SELECTION_FILTER_ALL,
  SELECTION_FILTER_FLOATING,
  SELECTION_FILTER_MARKDOWN,
  createSelectionFilterSnapshot,
  nextSelectionFilterMode,
  selectionForFilterMode,
  selectionMatchesFilterMode
} from "../src/selection-filter.mjs";

test("overlapping selections cycle through floating, Markdown, and all elements", () => {
  const strokes = [
    { id: "floating-drawing" },
    { id: "inserted-note-element", noteFlow: { enabled: true } },
    { id: "legacy-inserted-element", belowMarkdown: true }
  ];
  const snapshot = createSelectionFilterSnapshot(strokes, [2, 0, 1], ["md-b", "md-a"]);

  assert.equal(snapshot.hasMixedSelection, true);
  assert.deepEqual(selectionForFilterMode(snapshot, SELECTION_FILTER_FLOATING), {
    strokeIndexes: [0],
    markdownBlockIds: []
  });
  assert.deepEqual(selectionForFilterMode(snapshot, SELECTION_FILTER_MARKDOWN), {
    strokeIndexes: [1, 2],
    markdownBlockIds: ["md-a", "md-b"]
  });
  assert.deepEqual(selectionForFilterMode(snapshot, SELECTION_FILTER_ALL), {
    strokeIndexes: [0, 1, 2],
    markdownBlockIds: ["md-a", "md-b"]
  });
  assert.equal(nextSelectionFilterMode(SELECTION_FILTER_ALL), SELECTION_FILTER_FLOATING);
  assert.equal(nextSelectionFilterMode(SELECTION_FILTER_FLOATING), SELECTION_FILTER_MARKDOWN);
  assert.equal(nextSelectionFilterMode(SELECTION_FILTER_MARKDOWN), SELECTION_FILTER_ALL);
});

test("the cycle snapshot detects external selection changes", () => {
  const snapshot = createSelectionFilterSnapshot(
    [{}, { noteFlow: { enabled: true } }],
    [0, 1],
    ["md-1"]
  );

  assert.equal(selectionMatchesFilterMode(snapshot, SELECTION_FILTER_FLOATING, [0], []), true);
  assert.equal(selectionMatchesFilterMode(snapshot, SELECTION_FILTER_MARKDOWN, [1], ["md-1"]), true);
  assert.equal(selectionMatchesFilterMode(snapshot, SELECTION_FILTER_ALL, [0, 1], ["md-1"]), true);
  assert.equal(selectionMatchesFilterMode(snapshot, SELECTION_FILTER_FLOATING, [0, 1], []), false);
  assert.equal(selectionMatchesFilterMode(snapshot, SELECTION_FILTER_MARKDOWN, [1], []), false);
});

test("the only-select action stays unavailable without both element classes", () => {
  assert.equal(createSelectionFilterSnapshot([{}], [0], []).hasMixedSelection, false);
  assert.equal(createSelectionFilterSnapshot([{ noteFlow: { enabled: true } }], [0], ["md-1"]).hasMixedSelection, false);
  assert.equal(createSelectionFilterSnapshot([{}], [0], ["md-1"]).hasMixedSelection, true);
});
