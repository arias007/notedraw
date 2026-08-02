import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFountainPenSegments,
  straightenWatercolorPoints
} from "../src/stroke-dynamics.mjs";

test("fountain pen changes width with speed while keeping opacity constant", () => {
  const slow = buildFountainPenSegments([
    { x: 0, y: 0, t: 0 },
    { x: 0.02, y: 0, t: 40 }
  ], { canvasWidth: 1000, canvasHeight: 1000, baseWidth: 4, baseOpacity: 0.8 });
  const fast = buildFountainPenSegments([
    { x: 0, y: 0, t: 0 },
    { x: 0.08, y: 0, t: 8 }
  ], { canvasWidth: 1000, canvasHeight: 1000, baseWidth: 4, baseOpacity: 0.8 });

  assert.equal(slow.length, 1);
  assert.equal(fast.length, 1);
  assert.ok(slow[0].width > fast[0].width);
  assert.ok(slow[0].width / fast[0].width > 4, "fountain width contrast should remain visually distinct");
  assert.equal(slow[0].opacity, 0.8);
  assert.equal(fast[0].opacity, 0.8);
});

test("straight watercolor only locks strokes already close to an axis", () => {
  const horizontal = straightenWatercolorPoints([
    { x: 0.1, y: 0.2, t: 1 },
    { x: 0.5, y: 0.215, t: 2 }
  ], { canvasWidth: 1000, canvasHeight: 1000 });
  const diagonal = straightenWatercolorPoints([
    { x: 0.1, y: 0.2, t: 1 },
    { x: 0.5, y: 0.5, t: 2 }
  ], { canvasWidth: 1000, canvasHeight: 1000 });

  assert.equal(horizontal.axis, "horizontal");
  assert.equal(horizontal.points[0].y, horizontal.points[1].y);
  assert.equal(diagonal.axis, null);
  assert.deepEqual(diagonal.points, [
    { x: 0.1, y: 0.2, t: 1 },
    { x: 0.5, y: 0.5, t: 2 }
  ]);
});

test("straight watercolor can lock near-vertical strokes without changing timestamps", () => {
  const result = straightenWatercolorPoints([
    { x: 0.4, y: 0.1, t: 10 },
    { x: 0.41, y: 0.6, t: 30 }
  ], { canvasWidth: 600, canvasHeight: 1200 });

  assert.equal(result.axis, "vertical");
  assert.equal(result.points[0].x, result.points[1].x);
  assert.deepEqual(result.points.map((point) => point.t), [10, 30]);
});
