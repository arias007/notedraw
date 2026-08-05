import assert from "node:assert/strict";
import test from "node:test";

import {
  captureInitialReadingLayout,
  initialReadingLayoutSignature,
  isInitialReadingLayoutUsable,
  waitForStableReadingLayout
} from "../src/reading-layout.mjs";

test("initial reading layout metrics include virtual Markdown progress", () => {
  const preview = {
    clientWidth: 390,
    getBoundingClientRect: () => ({ width: 390 })
  };
  const sizer = {
    scrollHeight: 1600,
    offsetHeight: 1200,
    getBoundingClientRect: () => ({ height: 800 })
  };
  const renderer = {
    sections: [
      { shown: true, height: 600, el: { isConnected: true } },
      { shown: true, height: 0, el: { isConnected: false } }
    ]
  };

  const metrics = captureInitialReadingLayout(preview, sizer, renderer);
  assert.deepEqual(metrics, {
    previewWidth: 390,
    sizerHeight: 1600,
    sectionCount: 2,
    renderedSectionCount: 1,
    measuredSectionCount: 1
  });
  assert.equal(initialReadingLayoutSignature(metrics), "390:1600:2:1:1");
  assert.equal(isInitialReadingLayoutUsable(metrics), true);
});

test("first reading projection waits for several identical layout frames", async () => {
  const snapshots = [
    { previewWidth: 390, sizerHeight: 400, sectionCount: 3, renderedSectionCount: 1, measuredSectionCount: 1 },
    { previewWidth: 390, sizerHeight: 1200, sectionCount: 3, renderedSectionCount: 2, measuredSectionCount: 3 },
    { previewWidth: 390, sizerHeight: 1200, sectionCount: 3, renderedSectionCount: 2, measuredSectionCount: 3 },
    { previewWidth: 390, sizerHeight: 1200, sectionCount: 3, renderedSectionCount: 2, measuredSectionCount: 3 }
  ];
  let frame = 0;
  const stable = await waitForStableReadingLayout(
    () => snapshots[Math.min(Math.max(0, frame - 1), snapshots.length - 1)],
    {
      requestFrame: async () => {
        frame += 1;
      },
      stableFrames: 3,
      maxFrames: 8
    }
  );

  assert.equal(stable, true);
  assert.equal(frame, 4);
});

test("initial reading layout aborts without projecting a detached surface", async () => {
  let frame = 0;
  const stable = await waitForStableReadingLayout(
    () => ({ previewWidth: 390, sizerHeight: 800, sectionCount: 1, renderedSectionCount: 1, measuredSectionCount: 1 }),
    {
      requestFrame: async () => {
        frame += 1;
      },
      shouldAbort: () => frame >= 2
    }
  );

  assert.equal(stable, false);
  assert.equal(frame, 2);
});
