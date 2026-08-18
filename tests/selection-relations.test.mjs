import assert from "node:assert/strict";
import test from "node:test";

import { expandRelatedSelection } from "../src/selection-relations.mjs";

const box = (minX, minY, maxX, maxY) => ({ minX, minY, maxX, maxY });

test("related selection expands only through explicit arrow connectors", () => {
  const candidates = [
    { key: "stroke:0", elementId: "a", bounds: box(0, 0, 20, 20) },
    { key: "stroke:1", elementId: "b", bounds: box(10, 10, 30, 30) },
    { key: "markdown:m1", elementId: "m1", bounds: box(25, 25, 45, 45), groupId: "g1" },
    { key: "stroke:2", elementId: "c", bounds: box(100, 100, 110, 110), groupId: "g1" },
    { key: "stroke:3", elementId: "connector", bounds: box(200, 200, 202, 202), connector: { fromId: "c", toId: "d" } },
    { key: "stroke:4", elementId: "d", bounds: box(300, 300, 310, 310) },
    { key: "stroke:5", elementId: "unrelated", bounds: box(500, 500, 510, 510) }
  ];

  assert.deepEqual(Array.from(expandRelatedSelection(candidates, ["stroke:0"])), ["stroke:0"]);
  assert.deepEqual(
    Array.from(expandRelatedSelection(candidates, ["stroke:2"])).sort(),
    ["stroke:2", "stroke:3", "stroke:4"].sort()
  );
});

test("adjacent bounds that only touch do not select an entire compact document", () => {
  const candidates = [
    { key: "markdown:a", elementId: "a", bounds: box(0, 0, 100, 20) },
    { key: "markdown:b", elementId: "b", bounds: box(0, 20, 100, 40) }
  ];

  assert.deepEqual(Array.from(expandRelatedSelection(candidates, ["markdown:a"])), ["markdown:a"]);
});

test("overlap and group membership do not count as arrow relations", () => {
  const candidates = [
    { key: "stroke:a", elementId: "a", bounds: box(0, 0, 20, 20), groupId: "group" },
    { key: "stroke:b", elementId: "b", bounds: box(5, 5, 25, 25) },
    { key: "stroke:c", elementId: "c", bounds: box(50, 50, 70, 70), groupId: "group" }
  ];

  assert.deepEqual(Array.from(expandRelatedSelection(candidates, ["stroke:a"])), ["stroke:a"]);
});
