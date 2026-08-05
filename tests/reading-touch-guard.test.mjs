import assert from "node:assert/strict";
import test from "node:test";

import {
  beginReadingTouch,
  createReadingTouchGuardState,
  finishReadingTouch,
  moveReadingTouch,
  recordReadingTouchScroll,
  shouldSuppressReadingClick
} from "../src/reading-touch-guard.mjs";

test("an ordinary reading tap remains available", () => {
  const state = createReadingTouchGuardState();
  beginReadingTouch(state, { id: 1, x: 100, y: 200, now: 10 });
  assert.equal(moveReadingTouch(state, { id: 1, x: 104, y: 204, now: 20 }), false);
  assert.equal(finishReadingTouch(state, { id: 1, now: 30 }), false);
  assert.equal(shouldSuppressReadingClick(state, 31), false);
});

test("a quick reading swipe suppresses only its trailing synthetic click", () => {
  const state = createReadingTouchGuardState();
  beginReadingTouch(state, { id: 2, x: 120, y: 600, now: 100 });
  assert.equal(moveReadingTouch(state, { id: 2, x: 120, y: 540, now: 120 }), true);
  assert.equal(finishReadingTouch(state, { id: 2, now: 140 }), true);
  assert.equal(shouldSuppressReadingClick(state, 300), true);
  assert.equal(shouldSuppressReadingClick(state, 521), false);
});

test("kinetic scrolling extends the tap guard at the bottom of a note", () => {
  const state = createReadingTouchGuardState();
  beginReadingTouch(state, { id: 3, x: 160, y: 700, now: 1000 });
  moveReadingTouch(state, { id: 3, x: 160, y: 620, now: 1020 });
  finishReadingTouch(state, { id: 3, now: 1040 });

  assert.equal(recordReadingTouchScroll(state, { now: 1250 }), true);
  assert.equal(shouldSuppressReadingClick(state, 1500), true);
  assert.equal(shouldSuppressReadingClick(state, 1631), false);
});
