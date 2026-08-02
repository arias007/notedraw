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
  assert.ok(slow[0].width / fast[0].width > 1.4, "fountain width contrast should remain visually distinct");
  assert.ok(slow[0].width / fast[0].width < 2.1, "fountain width contrast should stay controlled rather than bead-like");
  assert.equal(slow[0].opacity, 0.8);
  assert.equal(fast[0].opacity, 0.8);
});

test("interpolated fast fountain points remain thin, continuous, and visible", () => {
  const points = Array.from({ length: 9 }, (_, index) => ({
    x: index * 0.01,
    y: 0,
    t: index * 0.2
  }));
  const segments = buildFountainPenSegments(points, {
    canvasWidth: 1000,
    canvasHeight: 1000,
    baseWidth: 4,
    baseOpacity: 0.35
  });

  assert.equal(segments.length, points.length - 1);
  assert.ok(segments.slice(0, 3).every((segment) => segment.width >= 2));
  assert.ok(segments.every((segment) => segment.opacity === 0.35));
  assert.ok(segments.at(-1).toWidth < segments.at(-1).fromWidth * 0.25, "a fast finish should taper to a pointed tail");
  assert.ok(segments.slice(0, -1).every((segment, index) => Math.abs(segment.toWidth - segments[index + 1].fromWidth) < 1e-9));
});

test("fountain width changes remain gradual across alternating input speeds", () => {
  const points = [
    { x: 0, y: 0, t: 0 },
    { x: 0.01, y: 0.002, t: 40 },
    { x: 0.08, y: 0.004, t: 45 },
    { x: 0.09, y: 0.006, t: 85 },
    { x: 0.16, y: 0.008, t: 90 },
    { x: 0.17, y: 0.01, t: 130 }
  ];
  const segments = buildFountainPenSegments(points, {
    canvasWidth: 1000,
    canvasHeight: 1000,
    baseWidth: 4
  });
  const body = segments.slice(0, -3);

  assert.ok(segments.every((segment) => Number.isFinite(segment.width) && segment.width > 0));
  assert.ok(body.every((segment, index) => index === 0 || Math.abs(segment.width - body[index - 1].width) <= 0.361));
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
