import assert from "node:assert/strict";
import test from "node:test";

import {
  pickRootPreview,
  shouldMountRootPreview,
  shouldRecoverEmptyRootPreview,
  shouldResetDormantRootPreview
} from "../src/preview-lifecycle.mjs";

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

test("only hidden source-mode previews are eligible for dormant geometry reset", () => {
  assert.equal(shouldResetDormantRootPreview({
    ...renderedPreview,
    sourceMode: true,
    visible: false,
    renderedContent: false
  }), true);
  assert.equal(shouldResetDormantRootPreview({
    ...renderedPreview,
    renderedContent: false
  }), false);
  assert.equal(shouldResetDormantRootPreview(renderedPreview), false);
  assert.equal(shouldResetDormantRootPreview({
    ...renderedPreview,
    sourceHasContent: false,
    renderedContent: false
  }), false);
});

test("a visible empty renderer is eligible for bounded preview recovery", () => {
  assert.equal(shouldRecoverEmptyRootPreview({
    ...renderedPreview,
    renderedContent: false,
    rendererMatches: true
  }), true);
  assert.equal(shouldRecoverEmptyRootPreview({
    ...renderedPreview,
    renderedContent: false,
    rendererMatches: false
  }), false);
  assert.equal(shouldRecoverEmptyRootPreview({
    ...renderedPreview,
    sourceMode: true,
    renderedContent: false,
    rendererMatches: true
  }), false);
});

test("a visible duplicate preview wins over a hidden renderer preview", () => {
  const hiddenRenderer = { id: "renderer" };
  const visiblePreview = { id: "visible" };

  assert.equal(pickRootPreview(
    [hiddenRenderer, visiblePreview],
    hiddenRenderer,
    (preview) => preview === visiblePreview,
    () => false
  ), visiblePreview);
});

test("the renderer preview remains the fallback while every preview is hidden", () => {
  const hiddenRenderer = { id: "renderer" };
  const hiddenAlternate = { id: "alternate" };

  assert.equal(pickRootPreview(
    [hiddenAlternate, hiddenRenderer],
    hiddenRenderer,
    () => false,
    () => false
  ), hiddenRenderer);
});
