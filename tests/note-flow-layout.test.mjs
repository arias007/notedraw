import assert from "node:assert/strict";
import test from "node:test";

import {
  hasStableNoteFlowAnchor,
  noteFlowRequiredOffset,
  noteFlowSurfaceRepairLimits,
  preserveAbsoluteNoteFlowPoints,
  projectNoteFlowDocumentPoint,
  reflowNoteFlowIntervals,
  selectNoteFlowAnchorPlacement,
  selectNoteFlowPositionAnchor,
  shouldRenderStrokeOnSurface,
  stabilizeNoteFlowPointProjection,
  stabilizeNoteFlowBounds
} from "../src/note-flow-layout.mjs";

test("saved note-flow anchors remain stable while their Markdown block is virtualized", () => {
  assert.equal(hasStableNoteFlowAnchor({
    line: 42,
    side: "before",
    positionBasis: "above",
    positionVersion: 1
  }), true);
  assert.equal(hasStableNoteFlowAnchor({
    line: null,
    side: "before",
    positionBasis: "above",
    positionVersion: 1
  }), false);
  assert.equal(hasStableNoteFlowAnchor({
    line: 42,
    side: null,
    positionBasis: "above",
    positionVersion: 1
  }), false);
  assert.equal(hasStableNoteFlowAnchor({
    line: 42,
    side: "before",
    positionBasis: "above",
    positionVersion: 0
  }), false);
});

const layout = {
  sourceFrame: { contentWidth: 520, documentHeight: 1360 },
  box: { y: 260, height: 210 }
};

test("runaway note-flow coordinates fall back to the saved element frame", () => {
  const result = stabilizeNoteFlowBounds({
    bounds: { minY: 506_000, maxY: 507_000 },
    layout,
    contentWidth: 390,
    viewportHeight: 720
  });

  assert.equal(result.runaway, true);
  assert.ok(result.bounds.minY >= 300 && result.bounds.minY < 400);
  assert.ok(result.bounds.maxY > result.bounds.minY && result.bounds.maxY < 800);
  assert.ok(result.referenceHeight < 2_000);
});

test("a partially collapsed runaway still converges to the saved frame", () => {
  const result = stabilizeNoteFlowBounds({
    bounds: { minY: 13_000, maxY: 13_240 },
    layout,
    contentWidth: 390,
    viewportHeight: 720
  });

  assert.equal(result.runaway, true);
  assert.ok(result.bounds.maxY < 800);
});

test("ordinary note-flow spacing also follows the saved frame instead of live canvas height", () => {
  const result = stabilizeNoteFlowBounds({
    bounds: { minY: 1_100, maxY: 1_240 },
    layout,
    contentWidth: 390,
    viewportHeight: 720
  });

  assert.equal(result.runaway, false);
  assert.ok(result.bounds.minY < 500);
  assert.ok(result.bounds.maxY < 800);
});

test("position-anchored note-flow uses its current projected bounds for Markdown spacing", () => {
  const result = stabilizeNoteFlowBounds({
    bounds: { minX: 10, minY: 420, maxX: 160, maxY: 680 },
    layout: {
      box: { y: 180, height: 120 },
      sourceFrame: { contentWidth: 500, documentHeight: 1000 }
    },
    contentWidth: 500,
    viewportHeight: 900,
    preferCurrent: true
  });

  assert.equal(result.runaway, false);
  assert.equal(result.bounds.minY, 420);
  assert.equal(result.bounds.maxY, 680);
});

test("legitimate positions in a long note remain untouched", () => {
  const bounds = { minY: 42_000, maxY: 42_240 };
  const result = stabilizeNoteFlowBounds({
    bounds,
    layout: {
      sourceFrame: { contentWidth: 520, documentHeight: 50_000 },
      box: { y: 42_000, height: 240 }
    },
    contentWidth: 520,
    viewportHeight: 900
  });

  assert.equal(result.runaway, false);
  assert.deepEqual(result.bounds, bounds);
});

test("surface repair limits stay close to stable content but preserve long notes", () => {
  assert.deepEqual(noteFlowSurfaceRepairLimits(1_850, 720), {
    stableHeight: 2_775,
    runawayThreshold: 11_100
  });
  assert.deepEqual(noteFlowSurfaceRepairLimits(50_000, 900), {
    stableHeight: 75_000,
    runawayThreshold: 300_000
  });
});

test("note-flow anchors to the first Markdown block below the stroke", () => {
  const first = { id: "first", top: 80, bottom: 112, start: 0, end: 0 };
  const below = { id: "below", top: 180, bottom: 214, start: 5, end: 6 };
  const placement = selectNoteFlowAnchorPlacement([first, below], { strokeTop: 150 });

  assert.equal(placement?.candidate.id, "below");
  assert.equal(placement?.side, "before");
  assert.equal(placement?.line, 5);
});

test("note-flow leaves an intersecting upper block in place", () => {
  const intersecting = { id: "upper", top: 80, bottom: 180, start: 0, end: 3 };
  const below = { id: "below", top: 210, bottom: 244, start: 4, end: 4 };
  const placement = selectNoteFlowAnchorPlacement([intersecting, below], { strokeTop: 150 });

  assert.equal(placement?.candidate.id, "below");
  assert.equal(placement?.side, "before");
  assert.equal(placement?.line, 4);
});

test("note-flow does not fall back to the first line for a middle stroke", () => {
  const placement = selectNoteFlowAnchorPlacement([
    { id: "first", top: 20, bottom: 52, start: 0, end: 0 },
    { id: "middle", top: 120, bottom: 156, start: 4, end: 4 },
    { id: "last", top: 220, bottom: 256, start: 8, end: 8 }
  ], { strokeTop: 170 });

  assert.equal(placement?.candidate.id, "last");
  assert.equal(placement?.line, 8);
});

test("note-flow reserves trailing space only below the document", () => {
  const placement = selectNoteFlowAnchorPlacement([
    { id: "first", top: 20, bottom: 52, start: 0, end: 0 },
    { id: "last", top: 120, bottom: 156, start: 4, end: 7 }
  ], { strokeTop: 220 });

  assert.equal(placement?.candidate.id, "last");
  assert.equal(placement?.side, "after");
  assert.equal(placement?.line, 7);
});

test("note-flow position anchors to the closest Markdown block above the stroke", () => {
  const position = selectNoteFlowPositionAnchor([
    { id: "first", top: 20, bottom: 52, start: 0, end: 1 },
    { id: "above", top: 90, bottom: 126, start: 4, end: 5 },
    { id: "below", top: 180, bottom: 214, start: 8, end: 8 }
  ], { strokeTop: 150 });

  assert.equal(position?.candidate.id, "above");
  assert.equal(position?.line, 5);
});

test("note-flow position never anchors to text below the stroke", () => {
  const position = selectNoteFlowPositionAnchor([
    { id: "below", top: 80, bottom: 112, start: 0, end: 0 }
  ], { strokeTop: 40 });

  assert.equal(position, null);
});

test("note-flow position stays before the Markdown block being pushed", () => {
  const position = selectNoteFlowPositionAnchor([
    { id: "stable-above", top: 90, bottom: 126, start: 4, end: 4, order: 1 },
    { id: "pushed-block", top: 150, bottom: 184, start: 5, end: 5, order: 2 },
    { id: "downstream", top: 210, bottom: 244, start: 6, end: 6, order: 3 }
  ], { strokeTop: 280, maxOrderExclusive: 2 });

  assert.equal(position?.candidate.id, "stable-above");
  assert.equal(position?.line, 4);
});

test("subpixel note-flow projection jitter is suppressed but real movement remains", () => {
  const previous = [{ x: 0.2, y: 0.25 }, { x: 0.4, y: 0.3 }];
  const tiny = stabilizeNoteFlowPointProjection(previous, [
    { x: 0.2005, y: 0.2504 },
    { x: 0.4005, y: 0.3004 }
  ], { canvasWidth: 1000, canvasHeight: 1000 });
  const moved = stabilizeNoteFlowPointProjection(previous, [
    { x: 0.21, y: 0.26 },
    { x: 0.41, y: 0.31 }
  ], { canvasWidth: 1000, canvasHeight: 1000 });

  assert.equal(tiny[0].x, previous[0].x);
  assert.equal(tiny[0].y, previous[0].y);
  assert.equal(moved[0].x, 0.21);
  assert.equal(moved[0].y, 0.26);
});

test("document-anchored note-flow keeps an absolute vertical position as the note grows", () => {
  const source = { anchor: { offsetY: 420 } };
  const projected = projectNoteFlowDocumentPoint(source, { x: 0.3, y: 0.8 }, { canvasHeight: 1200 });

  assert.equal(projected.x, 0.3);
  assert.equal(projected.y, 0.35);
});

test("note-flow settle resize preserves absolute ink coordinates", () => {
  const source = [{ x: 0.25, y: 0.5, anchor: { offsetY: 600 } }];
  const preserved = preserveAbsoluteNoteFlowPoints(source, {
    previousWidth: 800,
    previousHeight: 1200,
    nextWidth: 800,
    nextHeight: 2400
  });

  assert.equal(preserved[0].x * 800, 200);
  assert.equal(preserved[0].y * 2400, 600);
  assert.deepEqual(preserved[0].anchor, source[0].anchor);
});

test("note-flow padding keeps its required offset stable without moving upper content", () => {
  assert.equal(noteFlowRequiredOffset({
    side: "before",
    anchorTop: 240,
    anchorBottom: 272,
    desiredBottom: 260,
    applied: 40,
    scale: 1
  }), 20);
  assert.equal(noteFlowRequiredOffset({
    side: "after",
    anchorTop: 120,
    anchorBottom: 156,
    desiredBottom: 210,
    applied: 80,
    scale: 1
  }), 134);
});

test("inserted note elements are excluded only from the source editing surface", () => {
  const inserted = { noteFlow: { enabled: true } };
  assert.equal(shouldRenderStrokeOnSurface(inserted, "preview"), true);
  assert.equal(shouldRenderStrokeOnSurface(inserted, "source"), false);
  assert.equal(shouldRenderStrokeOnSurface({}, "source"), true);
});

test("moving an inserted element pushes later elements and fills a usable upper vacancy", () => {
  const placements = reflowNoteFlowIntervals([
    { id: "moved", index: 0, minY: 240, maxY: 320, originalMinY: 240, previousMinY: 100, previousMaxY: 180, moved: true },
    { id: "next", index: 1, minY: 220, maxY: 280, originalMinY: 220 },
    { id: "later", index: 2, minY: 300, maxY: 350, originalMinY: 300 }
  ], { gap: 12 });

  assert.deepEqual(placements.map(({ id, minY, maxY }) => ({ id, minY, maxY })), [
    { id: "next", minY: 100, maxY: 160 },
    { id: "moved", minY: 240, maxY: 320 },
    { id: "later", minY: 332, maxY: 382 }
  ]);
});
