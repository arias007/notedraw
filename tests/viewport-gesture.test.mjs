import assert from "node:assert/strict";
import test from "node:test";

import {
  calculatePinchPanScroll,
  calculateReadingZoomMargin,
  calculateVisualZoomLogicalWindow,
  resolveMultiTouchGestureMode
} from "../src/viewport-gesture.mjs";

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

test("pinch zoom preserves its anchor around a non-zero visual transform origin", () => {
  const scroll = calculatePinchPanScroll({
    scrollLeft: 100,
    scrollTop: 300,
    previousCenter: { x: 200, y: 250 },
    nextCenter: { x: 230, y: 270 },
    zoomRatio: 1.25,
    originX: 40,
    originY: 80,
    maxScrollLeft: 1200,
    maxScrollTop: 2400
  });

  assert.deepEqual(scroll, { left: 135, top: 397.5 });
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

test("ordinary two-finger movement stays pan despite small distance jitter", () => {
  assert.equal(resolveMultiTouchGestureMode({
    initialDistance: 180,
    distance: 185
  }), "pan");
  assert.equal(resolveMultiTouchGestureMode({
    initialDistance: 400,
    distance: 414
  }), "pan");
});

test("a deliberate pinch crosses both the absolute and relative threshold", () => {
  assert.equal(resolveMultiTouchGestureMode({
    initialDistance: 180,
    distance: 190
  }), "pinch");
  assert.equal(resolveMultiTouchGestureMode({
    mode: "pinch",
    initialDistance: 180,
    distance: 181
  }), "pinch");
});

test("reading zoom margin is derived from its stable baseline without cumulative drift", () => {
  const first = calculateReadingZoomMargin(12, 1200, 0.6);
  const repeated = calculateReadingZoomMargin(12, 1200, 0.6);

  assert.equal(first, -468);
  assert.equal(repeated, first);
  assert.equal(calculateReadingZoomMargin(12, 1200, 1.2), 12);
});

test("visual reading zoom maps the physical bottom viewport back to logical document coordinates", () => {
  const window = calculateVisualZoomLogicalWindow({
    scrollTop: 6766,
    viewportHeight: 611,
    zoom: 1.20062,
    origin: 39.7075
  });

  assert.ok(window.top > 5625 && window.top < 5635);
  assert.ok(window.height > 508 && window.height < 510);
  assert.equal(window.bottom, window.top + window.height);
});

test("eight-times reading zoom keeps the same logical document coordinates", () => {
  assert.deepEqual(calculateVisualZoomLogicalWindow({
    scrollTop: 8040,
    viewportHeight: 800,
    zoom: 8,
    origin: 40
  }), {
    top: 970,
    bottom: 1070,
    height: 100
  });
});

test("unscaled reading surfaces preserve ordinary scroll coordinates", () => {
  assert.deepEqual(calculateVisualZoomLogicalWindow({
    scrollTop: 640,
    viewportHeight: 720,
    zoom: 1,
    origin: 48
  }), {
    top: 640,
    bottom: 1360,
    height: 720
  });
});
