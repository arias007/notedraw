import assert from "node:assert/strict";
import test from "node:test";

import { calculatePinchPanScroll } from "../src/viewport-gesture.mjs";

test("two-finger translation pans without changing zoom", () => {
  const scroll = calculatePinchPanScroll({
    scrollLeft: 220,
    scrollTop: 480,
    previousCenter: { x: 260, y: 420 },
    nextCenter: { x: 230, y: 370 },
    zoomRatio: 1,
    maxScrollLeft: 900,
    maxScrollTop: 1800
  });

  assert.deepEqual(scroll, { left: 250, top: 530 });
});

test("pinch and translation preserve the content point between both fingers", () => {
  const scroll = calculatePinchPanScroll({
    scrollLeft: 100,
    scrollTop: 300,
    previousCenter: { x: 200, y: 250 },
    nextCenter: { x: 230, y: 270 },
    zoomRatio: 1.25,
    maxScrollLeft: 1200,
    maxScrollTop: 2400
  });

  assert.deepEqual(scroll, { left: 145, top: 417.5 });
});

test("pinch-pan coordinates cannot move into a blank area outside the scroll extent", () => {
  const scroll = calculatePinchPanScroll({
    scrollLeft: 900,
    scrollTop: 1900,
    previousCenter: { x: 300, y: 500 },
    nextCenter: { x: 10, y: 20 },
    zoomRatio: 2,
    maxScrollLeft: 980,
    maxScrollTop: 2100
  });

  assert.deepEqual(scroll, { left: 980, top: 2100 });
});
