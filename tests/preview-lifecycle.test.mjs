import assert from "node:assert/strict";
import test from "node:test";

import { shouldMountRootPreview, shouldResetDormantRootPreview } from "../src/preview-lifecycle.mjs";

const renderedPreview = {
  sourceMode: false,
  visible: true,
  hasSurface: true,
  sourceHasContent: true,
  renderedContent: true
};

test("a non-empty note waits for rendered Markdown before mounting NoteDraw", () => {
  assert.equal(shouldMountRootPreview({ ...renderedPreview, renderedContent: false }), false);
  assert.equal(shouldMountRootPreview(renderedPreview), true);
});

test("an empty note can still mount NoteDraw after its reading surface exists", () => {
  assert.equal(shouldMountRootPreview({
    ...renderedPreview,
    sourceHasContent: false,
    renderedContent: false
  }), true);
});

test("source mode and hidden reading surfaces never mount a root preview controller", () => {
  assert.equal(shouldMountRootPreview({ ...renderedPreview, sourceMode: true }), false);
  assert.equal(shouldMountRootPreview({ ...renderedPreview, visible: false }), false);
});

test("only empty non-empty-note surfaces are eligible for dormant geometry reset", () => {
  assert.equal(shouldResetDormantRootPreview({
    ...renderedPreview,
    sourceMode: true,
    visible: false,
    renderedContent: false
  }), true);
  assert.equal(shouldResetDormantRootPreview(renderedPreview), false);
  assert.equal(shouldResetDormantRootPreview({
    ...renderedPreview,
    sourceHasContent: false,
    renderedContent: false
  }), false);
});
