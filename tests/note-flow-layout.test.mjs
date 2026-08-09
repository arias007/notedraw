import assert from "node:assert/strict";
import test from "node:test";

import {
  frozenNoteFlowLayoutSignature,
  hasExactNoteFlowPlacement,
  hasStableNoteFlowAnchor,
  noteFlowAvoidanceReference,
  noteFlowBlockKey,
  noteFlowPlacementRowKey,
  noteFlowRequiredOffset,
  noteFlowRowReservation,
  noteFlowReservedRowTop,
  noteFlowNeedsActivationRepair,
  noteFlowSurfaceRepairLimits,
  normalizeFrozenNoteFlowLayout,
  preserveAbsoluteNoteFlowPoints,
  projectNoteFlowDocumentPoint,
  projectNoteFlowPointsToBox,
  projectStableNoteFlowBox,
  reflowNoteFlowRectangles,
  reflowNoteFlowIntervals,
  resizeNoteFlowGeometry,
  selectOwnedBlankSpaceCandidate,
  selectNoteFlowAnchorPlacement,
  selectNoteFlowAvoidanceCandidate,
  selectNoteFlowDropPlacement,
  selectExactNoteFlowPositionAnchor,
  selectNoteFlowInsertionPlacement,
  selectNoteFlowPositionAnchor,
  selectStoredNoteFlowAnchorCandidate,
  shouldPlaceStrokeBelowMarkdown,
  shouldRenderStrokeOnSurface,
  stabilizeNoteFlowPointProjection,
  stabilizeNoteFlowBounds,
  translateNoteFlowPointsToRow
} from "../src/note-flow-layout.mjs";

test("owned NoteFlow blank bands select the element that created the whitespace", () => {
  const candidates = [
    {
      ownerIndex: 2,
      rect: { left: 10, right: 210, top: 20, bottom: 220 },
      property: "padding-top",
      styleProperty: "padding-top",
      applied: 80,
      scale: 1
    },
    {
      ownerIndex: 4,
      rect: { left: 10, right: 210, top: 20, bottom: 220 },
      property: "padding-bottom",
      styleProperty: "padding-bottom",
      applied: 50,
      scale: 1
    },
    {
      ownerIndex: 7,
      rect: { left: 10, right: 210, top: 20, bottom: 220 },
      property: "height",
      styleProperty: "height",
      applied: 30,
      scale: 1
    },
    {
      ownerIndex: 9,
      rect: { left: 10, right: 210, top: 100, bottom: 140 },
      property: "padding-top",
      styleProperty: "margin-top",
      applied: 60,
      scale: 1
    },
    {
      ownerIndex: 10,
      rect: { left: 10, right: 210, top: 100, bottom: 140 },
      property: "padding-bottom",
      styleProperty: "margin-bottom",
      applied: 45,
      scale: 1
    }
  ];

  assert.equal(selectOwnedBlankSpaceCandidate(candidates, { clientX: 60, clientY: 60 })?.ownerIndex, 2);
  assert.equal(selectOwnedBlankSpaceCandidate(candidates, { clientX: 60, clientY: 200 })?.ownerIndex, 4);
  assert.equal(selectOwnedBlankSpaceCandidate([candidates[2]], { clientX: 60, clientY: 130 })?.ownerIndex, 7);
  assert.equal(selectOwnedBlankSpaceCandidate(candidates.slice(0, 2), { clientX: 60, clientY: 130 }), null);
  assert.equal(selectOwnedBlankSpaceCandidate([candidates[3]], { clientX: 60, clientY: 70 })?.ownerIndex, 9);
  assert.equal(selectOwnedBlankSpaceCandidate([candidates[4]], { clientX: 60, clientY: 170 })?.ownerIndex, 10);
  assert.equal(selectOwnedBlankSpaceCandidate(candidates.slice(3), { clientX: 60, clientY: 120 }), null);
});

test("frozen note-flow spacing is deterministic and keeps the largest offset per Markdown block", () => {
  const normalized = normalizeFrozenNoteFlowLayout({
    offsets: [
      { path: "Folder\\Note.md", line: 8.9, side: "before", offset: 42.1254 },
      { path: "Folder/Note.md", line: 8, property: "padding-top", offset: 56 },
      { path: "Folder/Note.md", line: 12, side: "after", offset: 20 },
      { path: "", line: 1, side: "before", offset: 10 },
      { path: "Folder/Note.md", line: -1, side: "before", offset: 10 }
    ]
  });

  assert.deepEqual(normalized, {
    version: 1,
    offsets: [
      { path: "Folder/Note.md", line: 8, blockStart: 8, blockEnd: 8, blockKey: "Folder/Note.md\u00008\u00008", side: "before", property: "padding-top", offset: 56 },
      { path: "Folder/Note.md", line: 12, blockStart: 12, blockEnd: 12, blockKey: "Folder/Note.md\u000012\u000012", side: "after", property: "padding-bottom", offset: 20 }
    ]
  });
  assert.equal(
    frozenNoteFlowLayoutSignature(normalized),
    "Folder/Note.md\u00008\u00008:padding-top:56|Folder/Note.md\u000012\u000012:padding-bottom:20"
  );
});

test("frozen NoteFlow spacing keeps a stable owner for blank-space selection", () => {
  const normalized = normalizeFrozenNoteFlowLayout({
    offsets: [{
      path: "Folder/Note.md",
      line: 8,
      side: "before",
      offset: 56,
      ownerId: "element-42"
    }]
  });
  assert.equal(normalized.offsets[0].ownerId, "element-42");
  assert.equal(frozenNoteFlowLayoutSignature(normalized), "Folder/Note.md\u00008\u00008:padding-top:56:element-42");
});

test("NoteFlow uses one Markdown block identity for preview, settlement, and restore", () => {
  const taskBlock = {
    path: "Folder/Note.md",
    line: 12,
    blockStart: 10,
    blockEnd: 12,
    side: "after"
  };

  assert.equal(noteFlowBlockKey(taskBlock), "Folder/Note.md\u000010\u000012");
  assert.equal(noteFlowPlacementRowKey(taskBlock), "Folder/Note.md\u000010\u000012\u0000after");
  assert.equal(noteFlowPlacementRowKey({ ...taskBlock, side: null }), "");
});

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

test("activation repairs note-flow elements without frozen clearance", () => {
  assert.equal(noteFlowNeedsActivationRepair([
    { noteFlow: { enabled: true, avoidancePath: "", avoidanceLine: null } }
  ], { version: 1, offsets: [] }), true);
  assert.equal(noteFlowNeedsActivationRepair([
    { noteFlow: { enabled: true, avoidancePath: "Notes/example.md", avoidanceLine: 12 } }
  ], { version: 1, offsets: [{ path: "Notes/example.md", line: 12, property: "padding-top", offset: 24 }] }), false);
  assert.equal(noteFlowNeedsActivationRepair([], { version: 1, offsets: [] }), false);
});

test("null avoidance lines never become a stored line-zero reference", () => {
  assert.equal(noteFlowAvoidanceReference({
    avoidancePath: "Notes/example.md",
    avoidanceLine: null
  }), null);
  assert.equal(noteFlowAvoidanceReference({
    avoidancePath: "Notes/example.md",
    avoidanceLine: ""
  }), null);
  assert.deepEqual(noteFlowAvoidanceReference({
    avoidancePath: "Notes\\example.md",
    avoidanceLine: 0
  }), { path: "Notes/example.md", line: 0 });
  assert.equal(noteFlowNeedsActivationRepair([
    { noteFlow: { enabled: true, avoidancePath: "Notes/example.md", avoidanceLine: null } }
  ], { version: 1, offsets: [{ path: "Notes/example.md", line: 0, offset: 24 }] }), true);
});

test("activation repairs note-flow elements when frozen clearance belongs to another line", () => {
  assert.equal(noteFlowNeedsActivationRepair([
    { noteFlow: { enabled: true, avoidancePath: "Notes/example.md", avoidanceLine: 12 } }
  ], { version: 1, offsets: [{ path: "Notes/example.md", line: 18, property: "padding-top", offset: 24 }] }), true);
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

test("note-flow starts at a precise rendered line crossed by the stroke", () => {
  const placement = selectNoteFlowInsertionPlacement([
    { id: "paragraph", top: 80, bottom: 260, start: 0, end: 7, order: 0 },
    { id: "line-5", top: 168, bottom: 194, start: 5, end: 5, order: 1, lineSpacer: {} },
    { id: "next", top: 280, bottom: 312, start: 8, end: 8, order: 2 }
  ], { strokeTop: 166, strokeBottom: 202 });

  assert.equal(placement?.candidate.id, "line-5");
  assert.equal(placement?.side, "before");
  assert.equal(placement?.line, 5);
});

test("dragged note-flow elements commit to the nearest visible blue-bar boundary", () => {
  const candidates = [
    { id: "first", top: 80, bottom: 112, start: 0, end: 0, order: 0 },
    { id: "second", top: 180, bottom: 214, start: 5, end: 6, order: 1 }
  ];

  assert.equal(selectNoteFlowDropPlacement(candidates, { dropY: 87 })?.side, "before");
  assert.equal(selectNoteFlowDropPlacement(candidates, { dropY: 108 })?.side, "after");
  assert.equal(selectNoteFlowDropPlacement(candidates, { dropY: 166 })?.side, "before");
  assert.equal(selectNoteFlowDropPlacement(candidates, { dropY: 260 })?.side, "after");
});

test("dragged note-flow elements prefer the nearest precise rendered line boundary", () => {
  const placement = selectNoteFlowDropPlacement([
    { id: "paragraph", top: 80, bottom: 260, start: 0, end: 7, order: 0 },
    { id: "line-5", top: 168, bottom: 194, start: 5, end: 5, order: 1, lineSpacer: {} }
  ], { dropY: 171 });

  assert.equal(placement?.candidate.id, "line-5");
  assert.equal(placement?.side, "before");
  assert.equal(placement?.line, 5);
});

test("note-flow skips a broad paragraph above the stroke and starts at the next block", () => {
  const placement = selectNoteFlowInsertionPlacement([
    { id: "broad", top: 60, bottom: 240, start: 0, end: 7, order: 0 },
    { id: "next", top: 252, bottom: 286, start: 8, end: 8, order: 1 }
  ], { strokeTop: 180, strokeBottom: 214 });

  assert.equal(placement?.candidate.id, "next");
  assert.equal(placement?.line, 8);
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

test("exact after placement stays anchored to the blue-bar target line", () => {
  const target = { id: "hello", top: 150, bottom: 184, start: 9, end: 9, order: 2 };
  const position = selectExactNoteFlowPositionAnchor([
    { id: "above", top: 90, bottom: 126, start: 4, end: 4, order: 1 },
    target,
    { id: "covered-below", top: 210, bottom: 244, start: 19, end: 19, order: 3 }
  ], { candidate: target, side: "after", line: 9 });

  assert.equal(position?.candidate.id, "hello");
  assert.equal(position?.line, 9);
});

test("exact before placement uses only the stable Markdown anchor above its target", () => {
  const target = { id: "target", top: 150, bottom: 184, start: 9, end: 9, order: 2 };
  const position = selectExactNoteFlowPositionAnchor([
    { id: "above", top: 90, bottom: 126, start: 4, end: 4, order: 1 },
    target,
    { id: "below", top: 210, bottom: 244, start: 19, end: 19, order: 3 }
  ], { candidate: target, side: "before", line: 9 });

  assert.equal(position?.candidate.id, "above");
  assert.equal(position?.line, 4);
});

test("stored v1 NoteFlow anchors migrate to exact placement without avoidance", () => {
  const legacyExact = {
    enabled: true,
    path: "Notes/example.md",
    line: 9,
    side: "after",
    positionBasis: "above",
    positionLine: 9,
    positionVersion: 1,
    avoidancePath: "Notes/example.md",
    avoidanceLine: 19
  };

  assert.equal(hasExactNoteFlowPlacement(legacyExact), true);
  assert.equal(noteFlowAvoidanceReference(legacyExact), null);
  assert.equal(noteFlowNeedsActivationRepair([
    { noteFlow: legacyExact }
  ], { version: 1, offsets: [{ path: "Notes/example.md", line: 19, property: "padding-top", offset: 120 }] }), true);
});

test("duplicate stored line anchors resolve to the block beside the ink", () => {
  const firstTask = { id: "first", top: 992, bottom: 1045, order: 3 };
  const laterTask = { id: "later", top: 1248, bottom: 1278, order: 7 };

  assert.equal(selectStoredNoteFlowAnchorCandidate(
    [laterTask, firstTask],
    { side: "before", strokeTop: 993 }
  )?.id, "first");
});

test("stored after anchors prefer the closest block above the ink", () => {
  const earlier = { id: "earlier", top: 80, bottom: 112, order: 0 };
  const closest = { id: "closest", top: 140, bottom: 176, order: 1 };

  assert.equal(selectStoredNoteFlowAnchorCandidate(
    [earlier, closest],
    { side: "after", strokeTop: 190 }
  )?.id, "closest");
});

test("note-flow avoidance targets the intersecting rendered line", () => {
  const target = selectNoteFlowAvoidanceCandidate([
    { id: "line-1", top: 120, bottom: 150, start: 1, end: 1, order: 0 },
    { id: "line-2", top: 162, bottom: 192, start: 2, end: 2, order: 1 },
    { id: "line-3", top: 204, bottom: 234, start: 3, end: 3, order: 2 }
  ], { strokeTop: 158, strokeBottom: 198 });

  assert.equal(target?.id, "line-2");
  assert.equal(target?.start, 2);
});

test("note-flow avoidance starts at the first concrete line crossed by a tall stroke", () => {
  const target = selectNoteFlowAvoidanceCandidate([
    { id: "line-3", top: 150, bottom: 180, start: 3, end: 3, order: 0 },
    { id: "line-4", top: 190, bottom: 220, start: 4, end: 4, order: 1 },
    { id: "line-5", top: 230, bottom: 260, start: 5, end: 5, order: 2 }
  ], { strokeTop: 176, strokeBottom: 244 });

  assert.equal(target?.id, "line-3");
  assert.equal(target?.start, 3);
});

test("note-flow avoidance prefers a concrete line over a larger embed wrapper", () => {
  const target = selectNoteFlowAvoidanceCandidate([
    { id: "embed", top: 100, bottom: 260, start: 0, end: 4, order: 0 },
    { id: "line-2", top: 162, bottom: 192, start: 2, end: 2, order: 1 }
  ], { strokeTop: 158, strokeBottom: 198 });

  assert.equal(target?.id, "line-2");
});

test("note-flow avoidance ignores non-overlapping Markdown lines", () => {
  const target = selectNoteFlowAvoidanceCandidate([
    { id: "above", top: 80, bottom: 112, start: 0, end: 0 },
    { id: "below", top: 220, bottom: 252, start: 4, end: 4 }
  ], { strokeTop: 150, strokeBottom: 190 });

  assert.equal(target, null);
});

test("note-flow avoidance never pads a broad multi-line container from its top", () => {
  const target = selectNoteFlowAvoidanceCandidate([
    { id: "broad", top: 60, bottom: 260, start: 0, end: 8 }
  ], { strokeTop: 170, strokeBottom: 205 });

  assert.equal(target, null);
});

test("note-flow avoidance can pad a block when a large stroke covers the whole block", () => {
  const target = selectNoteFlowAvoidanceCandidate([
    { id: "broad", top: 60, bottom: 260, start: 0, end: 8 }
  ], { strokeTop: 40, strokeBottom: 280 });

  assert.equal(target?.id, "broad");
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

test("note-flow padding preserves Markdown clearance at visual reading zoom", () => {
  for (const scale of [2, 5, 8]) {
    assert.equal(noteFlowRequiredOffset({
      side: "before",
      anchorTop: 240 * scale,
      anchorBottom: 272 * scale,
      desiredBottom: 260 * scale,
      applied: 40,
      scale
    }), 20);
    assert.equal(noteFlowRequiredOffset({
      side: "after",
      anchorTop: 120 * scale,
      anchorBottom: 156 * scale,
      desiredBottom: 210 * scale,
      applied: 80,
      scale
    }), 134);
  }
});

test("NoteFlow row reservation is idempotent and never depends on previously applied padding", () => {
  const input = { rowOffset: 36, boxHeight: 84, gap: 12 };
  const first = noteFlowRowReservation(input);
  assert.equal(first, 132);
  for (let pass = 0; pass < 5; pass += 1) {
    assert.equal(noteFlowRowReservation(input), first);
  }
});

test("resizing NoteFlow geometry expands and contracts its Markdown reservation", () => {
  const base = { rowOffset: 10 };
  const originalBounds = { minX: 60, minY: 100, maxX: 180, maxY: 160 };
  const enlarged = resizeNoteFlowGeometry(base, {
    originalBounds,
    resizedBounds: { minX: 60, minY: 100, maxX: 240, maxY: 220 },
    contentLeft: 20,
    contentWidth: 400
  });
  const contracted = resizeNoteFlowGeometry(base, {
    originalBounds,
    resizedBounds: { minX: 80, minY: 110, maxX: 140, maxY: 140 },
    contentLeft: 20,
    contentWidth: 400
  });

  assert.deepEqual(enlarged, {
    rowOffset: 10,
    boxLeftRatio: 0.1,
    boxWidthRatio: 0.45,
    boxHeightRatio: 0.3
  });
  assert.deepEqual(contracted, {
    rowOffset: 20,
    boxLeftRatio: 0.15,
    boxWidthRatio: 0.15,
    boxHeightRatio: 0.075
  });
  assert.equal(noteFlowRowReservation({
    rowOffset: enlarged.rowOffset,
    boxHeight: enlarged.boxHeightRatio * 400,
    gap: 12
  }), 142);
  assert.equal(noteFlowRowReservation({
    rowOffset: contracted.rowOffset,
    boxHeight: contracted.boxHeightRatio * 400,
    gap: 12
  }), 62);
});

test("NoteFlow ink stays at the top of its own reserved after-row", () => {
  assert.equal(noteFlowReservedRowTop({
    side: "after",
    anchorTop: 400,
    anchorBottom: 634.859,
    applied: 116.859,
    scale: 1
  }), 518);
  assert.equal(noteFlowReservedRowTop({
    side: "before",
    anchorTop: 400,
    anchorBottom: 520,
    applied: 116.859,
    scale: 1
  }), 400);
});

test("NoteFlow stable box projection preserves width at the left edge", () => {
  const projected = projectStableNoteFlowBox({
    boxLeftRatio: -0.25,
    boxWidthRatio: 0.4,
    boxHeightRatio: 0.2,
    contentLeft: 24,
    contentWidth: 300,
    canvasWidth: 360,
    y: 120
  });
  assert.deepEqual(projected, { x: 0, y: 120, width: 120, height: 60 });
  assert.ok(projected.width > 2);
});

test("NoteFlow stable box projection never accepts a transient collapsed lane", () => {
  for (const contentWidth of [0, 1, 20]) {
    const projected = projectStableNoteFlowBox({
      boxLeftRatio: 0.1,
      boxWidthRatio: 0.3,
      boxHeightRatio: 0.2,
      contentLeft: 0,
      contentWidth,
      canvasWidth: 400,
      y: 50
    });
    assert.equal(projected.width, 120);
    assert.ok(projected.width >= 24);
  }
});

test("NoteFlow stable box projection restores a saved width when old points already collapsed", () => {
  const projected = projectStableNoteFlowBox({
    boxLeftRatio: 0.2,
    boxWidthRatio: 0.002,
    boxHeightRatio: 0.2,
    contentWidth: 360,
    canvasWidth: 400,
    fallbackWidth: 96,
    y: 50
  });
  assert.equal(projected.width, 96);
});

test("NoteFlow current geometry expands into its stable box instead of collapsing left", () => {
  const source = [
    { x: 0.49, y: 0.2, pressure: 0.4 },
    { x: 0.495, y: 0.25, pressure: 0.6 },
    { x: 0.5, y: 0.3, pressure: 0.8 }
  ];
  const target = { x: 40, y: 180, width: 120, height: 80 };
  const projected = projectNoteFlowPointsToBox(source, {
    minX: 196,
    minY: 160,
    maxX: 200,
    maxY: 240
  }, target, { canvasWidth: 400, canvasHeight: 800 });
  const xs = projected.map((point) => point.x * 400);
  const ys = projected.map((point) => point.y * 800);
  assert.deepEqual(xs.map(Math.round), [40, 100, 160]);
  assert.deepEqual(ys.map(Math.round), [180, 220, 260]);
  assert.deepEqual(projected.map((point) => point.pressure), [0.4, 0.6, 0.8]);
  const repeated = projectNoteFlowPointsToBox(projected, {
    minX: 40,
    minY: 180,
    maxX: 160,
    maxY: 260
  }, target, { canvasWidth: 400, canvasHeight: 800 });
  assert.deepEqual(repeated, projected);
});

test("NoteFlow drag settlement translates points without changing horizontal geometry", () => {
  const source = [
    { x: 0.2, y: 0.2, pressure: 0.4 },
    { x: 0.45, y: 0.24, pressure: 0.6 },
    { x: 0.7, y: 0.28, pressure: 0.8 }
  ];
  const translated = translateNoteFlowPointsToRow(source, {
    minX: 80,
    minY: 160,
    maxX: 280,
    maxY: 224
  }, 360, { canvasWidth: 400, canvasHeight: 800 });

  assert.deepEqual(translated.map((point) => point.x), source.map((point) => point.x));
  assert.deepEqual(translated.map((point) => point.pressure), source.map((point) => point.pressure));
  assert.deepEqual(translated.map((point) => Math.round(point.y * 800)), [360, 392, 424]);
});

test("inserted note elements are excluded only from the source editing surface", () => {
  const inserted = { noteFlow: { enabled: true } };
  assert.equal(shouldRenderStrokeOnSurface(inserted, "preview"), true);
  assert.equal(shouldRenderStrokeOnSurface(inserted, "source"), false);
  assert.equal(shouldRenderStrokeOnSurface({}, "source"), true);
});

test("inserted note elements always remain below Markdown content", () => {
  assert.equal(shouldPlaceStrokeBelowMarkdown({ noteFlow: { enabled: true }, belowMarkdown: false }), true);
  assert.equal(shouldPlaceStrokeBelowMarkdown({ belowMarkdown: true }), true);
  assert.equal(shouldPlaceStrokeBelowMarkdown({}), false);
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

test("NoteFlow rows move side-by-side elements together after a real collision", () => {
  const placements = reflowNoteFlowRectangles([
    { id: "upper", index: 0, minX: 0, maxX: 100, minY: 0, maxY: 40, originalMinY: 0 },
    { id: "moved", index: 1, minX: 0, maxX: 100, minY: 60, maxY: 100, originalMinY: 60, moved: true },
    { id: "collision", index: 2, minX: 20, maxX: 80, minY: 80, maxY: 120, originalMinY: 80 },
    { id: "inline", index: 3, minX: 120, maxX: 200, minY: 80, maxY: 120, originalMinY: 80 }
  ], { gap: 6 });

  assert.deepEqual(placements.map(({ id, minY, maxY }) => ({ id, minY, maxY })), [
    { id: "upper", minY: 0, maxY: 40 },
    { id: "moved", minY: 60, maxY: 100 },
    { id: "collision", minY: 106, maxY: 146 },
    { id: "inline", minY: 106, maxY: 146 }
  ]);
});

test("NoteFlow row height follows its tallest side-by-side element", () => {
  const placements = reflowNoteFlowRectangles([
    { id: "moved", index: 0, minX: 0, maxX: 100, minY: 40, maxY: 90, originalMinY: 40, moved: true },
    { id: "next", index: 1, minX: 10, maxX: 90, minY: 70, maxY: 110, originalMinY: 70 },
    { id: "later", index: 2, minX: 10, maxX: 90, minY: 100, maxY: 130, originalMinY: 100 },
    { id: "other-column", index: 3, minX: 120, maxX: 200, minY: 70, maxY: 130, originalMinY: 70 }
  ], { gap: 6 });

  assert.deepEqual(placements.map(({ id, minY }) => ({ id, minY })), [
    { id: "moved", minY: 40 },
    { id: "next", minY: 96 },
    { id: "later", minY: 162 },
    { id: "other-column", minY: 96 }
  ]);
});

test("NoteFlow recomputes from stable row bases instead of accumulating old displacement", () => {
  const input = [
    { id: "tall", index: 0, rowKey: "line-1", minX: 0, maxX: 90, minY: 160, maxY: 240, baseMinY: 100, originalMinY: 160 },
    { id: "short", index: 1, rowKey: "line-1", minX: 110, maxX: 180, minY: 180, maxY: 220, baseMinY: 100, originalMinY: 180, align: "bottom" },
    { id: "next", index: 2, rowKey: "line-2", minX: 0, maxX: 90, minY: 260, maxY: 300, baseMinY: 140, originalMinY: 260 }
  ];
  const first = reflowNoteFlowRectangles(input, { gap: 6 });
  const replay = reflowNoteFlowRectangles(input.map((item) => {
    const placement = first.find((candidate) => candidate.id === item.id);
    return { ...item, minY: placement.minY, maxY: placement.maxY, originalMinY: placement.minY };
  }), { gap: 6 });

  assert.deepEqual(first.map(({ id, minY, maxY }) => ({ id, minY, maxY })), [
    { id: "tall", minY: 100, maxY: 180 },
    { id: "short", minY: 140, maxY: 180 },
    { id: "next", minY: 186, maxY: 226 }
  ]);
  assert.deepEqual(replay.map(({ id, minY, maxY }) => ({ id, minY, maxY })), first.map(({ id, minY, maxY }) => ({ id, minY, maxY })));
});

test("NoteFlow row-key insertion reserves one exclusive row even when elements do not overlap horizontally", () => {
  const placements = reflowNoteFlowRectangles([
    { id: "left", index: 0, rowKey: "line-1\0after", minX: 0, maxX: 60, minY: 100, maxY: 150, baseMinY: 100, originalMinY: 100 },
    { id: "right", index: 1, rowKey: "line-1\0after", minX: 240, maxX: 300, minY: 110, maxY: 130, baseMinY: 100, originalMinY: 110 },
    { id: "next", index: 2, rowKey: "line-2\0after", minX: 0, maxX: 300, minY: 130, maxY: 170, baseMinY: 130, originalMinY: 130 }
  ], { gap: 6 });

  assert.deepEqual(placements.map(({ id, minY, maxY }) => ({ id, minY, maxY })), [
    { id: "left", minY: 100, maxY: 150 },
    { id: "right", minY: 100, maxY: 120 },
    { id: "next", minY: 156, maxY: 196 }
  ]);
});

test("a blue-bar row top cannot rise through an upper NoteFlow row", () => {
  const placements = reflowNoteFlowRectangles([
    { id: "upper", index: 0, rowKey: "line-1", minX: 0, maxX: 100, minY: 100, maxY: 160, baseMinY: 100, originalMinY: 100 },
    { id: "dropped", index: 1, rowKey: "line-2", minX: 20, maxX: 80, minY: 130, maxY: 170, baseMinY: 130, originalMinY: 130, moved: true }
  ], { gap: 6 });

  assert.deepEqual(placements.map(({ id, minY, maxY }) => ({ id, minY, maxY })), [
    { id: "upper", minY: 100, maxY: 160 },
    { id: "dropped", minY: 166, maxY: 206 }
  ]);
});

test("overlapping NoteFlow boxes in one logical row stack tightly and never intersect", () => {
  const placements = reflowNoteFlowRectangles([
    { id: "left", index: 0, rowKey: "line-8", minX: 0, maxX: 120, minY: 100, maxY: 150, baseMinY: 100, originalMinY: 100 },
    { id: "overlap", index: 1, rowKey: "line-8", minX: 80, maxX: 180, minY: 100, maxY: 140, baseMinY: 100, originalMinY: 100 },
    { id: "right", index: 2, rowKey: "line-8", minX: 190, maxX: 260, minY: 100, maxY: 130, baseMinY: 100, originalMinY: 100 }
  ], { gap: 6 });

  assert.deepEqual(placements.map(({ id, minY, maxY }) => ({ id, minY, maxY })), [
    { id: "left", minY: 100, maxY: 150 },
    { id: "overlap", minY: 156, maxY: 196 },
    { id: "right", minY: 100, maxY: 130 }
  ]);
  const left = placements[0];
  const overlap = placements[1];
  assert.equal(overlap.minY - left.maxY, 6);
});
