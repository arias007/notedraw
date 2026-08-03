import assert from "node:assert/strict";
import test from "node:test";

import { calculatePinchPanScroll, calculateReadingZoomMargin } from "../src/viewport-gesture.mjs";

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

test("subpixel touch jitter cannot slowly drift the note", () => {
  const scroll = calculatePinchPanScroll({
    scrollLeft: 120,
    scrollTop: 640,
    previousCenter: { x: 200, y: 300 },
    nextCenter: { x: 200.2, y: 299.8 },
    zoomRatio: 1,
    maxScrollLeft: 800,
    maxScrollTop: 1800
  });

  assert.deepEqual(scroll, { left: 120, top: 640 });
});

test("reading zoom margin is derived from its stable baseline without cumulative drift", () => {
  const first = calculateReadingZoomMargin(12, 1200, 0.6);
  const repeated = calculateReadingZoomMargin(12, 1200, 0.6);

  assert.equal(first, -468);
  assert.equal(repeated, first);
  assert.equal(calculateReadingZoomMargin(12, 1200, 1.2), 12);
});
