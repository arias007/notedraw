import assert from "node:assert/strict";
import test from "node:test";

import { buildSnappedConnectorPoints, connectorSnapThreshold } from "../src/connector-binding.mjs";

const canvas = { canvasWidth: 1000, canvasHeight: 600, timestamp: 1 };
const left = { minX: 100, minY: 100, maxX: 260, maxY: 200 };
const right = { minX: 700, minY: 300, maxX: 900, maxY: 440 };

test("connector snapping keeps a practical hit target on mouse and touch", () => {
  assert.equal(connectorSnapThreshold(0), 28);
  assert.equal(connectorSnapThreshold(20), 35);
});

test("two bound ends attach to the facing edges of both elements", () => {
  const points = buildSnappedConnectorPoints({
    ...canvas,
    fromBounds: left,
    toBounds: right,
    fromPoint: { x: 0.12, y: 0.18 },
    toPoint: { x: 0.82, y: 0.36 }
  });

  assert.deepEqual(points.map(({ x, y }) => [x, y]), [
    [0.26, 0.25],
    [0.48, 0.25],
    [0.7, 0.6166666666666667]
  ]);
});

test("a single bound end follows its element while the free end stays fixed", () => {
  const originalFreeEnd = { x: 0.82, y: 0.2 };
  const first = buildSnappedConnectorPoints({
    ...canvas,
    fromBounds: left,
    fromPoint: { x: 0.12, y: 0.18 },
    toPoint: originalFreeEnd
  });
  const moved = buildSnappedConnectorPoints({
    ...canvas,
    fromBounds: { minX: 200, minY: 240, maxX: 360, maxY: 340 },
    fromPoint: first[0],
    toPoint: first[2]
  });

  assert.notDeepEqual(moved[0], first[0]);
  assert.deepEqual({ x: moved[2].x, y: moved[2].y }, originalFreeEnd);
});

test("a free start stays fixed when only the arrow end is bound", () => {
  const freeStart = { x: 0.18, y: 0.82 };
  const points = buildSnappedConnectorPoints({
    ...canvas,
    toBounds: right,
    fromPoint: freeStart,
    toPoint: { x: 0.78, y: 0.62 }
  });

  assert.deepEqual({ x: points[0].x, y: points[0].y }, freeStart);
  assert.equal(points[2].x, 0.7);
});
