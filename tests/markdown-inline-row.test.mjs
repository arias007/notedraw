import assert from "node:assert/strict";
import test from "node:test";

import { allocateInlineRow, distributeInlineRowSpans } from "../src/markdown-inline-row.mjs";

test("inline rows distribute every column and narrow the right side first", () => {
  assert.deepEqual(distributeInlineRowSpans(2), [6, 6]);
  assert.deepEqual(distributeInlineRowSpans(3), [4, 4, 4]);
  assert.deepEqual(distributeInlineRowSpans(4), [3, 3, 3, 3]);
  assert.deepEqual(distributeInlineRowSpans(5), [3, 3, 2, 2, 2]);
  assert.deepEqual(distributeInlineRowSpans(7), [2, 2, 2, 2, 2, 1, 1]);
  assert.deepEqual(distributeInlineRowSpans(12), Array(12).fill(1));
  assert.deepEqual(distributeInlineRowSpans(13), []);
});

test("inline allocation keeps three or more items in one deterministic order", () => {
  const allocation = allocateInlineRow({
    existingIds: ["first", "target", "last"],
    movingIds: ["moving-a", "moving-b"],
    targetId: "target",
    side: "right"
  });

  assert.equal(allocation.canFit, true);
  assert.deepEqual(allocation.orderedIds, ["first", "target", "moving-a", "moving-b", "last"]);
  assert.deepEqual(allocation.spans, [3, 3, 2, 2, 2]);
  assert.equal(allocation.spanById.get("first"), 3);
  assert.equal(allocation.spanById.get("last"), 2);
});

test("stroke placeholders share the same allocation as Markdown blocks", () => {
  const allocation = allocateInlineRow({
    existingIds: ["left", "target", "right"],
    targetId: "target",
    side: "left",
    extraMovingCount: 2
  });

  assert.equal(allocation.canFit, true);
  assert.deepEqual(allocation.orderedIds, [
    "left",
    "__notedraw-inline-extra-0__",
    "__notedraw-inline-extra-1__",
    "target",
    "right"
  ]);
  assert.deepEqual(allocation.spans, [3, 3, 2, 2, 2]);
});
