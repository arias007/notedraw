import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  FORMAT_TOOLBAR_BLOCK_GAP,
  FORMAT_TOOLBAR_MARGIN_GAP,
  resolveFormatToolbarPlacement
} from "../src/format-toolbar-placement.mjs";
import {
  EDIT_MD_DRAG_THRESHOLD_PX,
  editMdDragIsActive,
  resolveEditMdDragSelection
} from "../src/edit-md-drag.mjs";

const viewport = { left: 0, top: 0, width: 1400, height: 900 };
const size = { width: 300, height: 36 };

function overlaps(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function rect(left, top, width, height) {
  return { left, top, right: left + width, bottom: top + height, width, height };
}

test("the format bar never covers the block it is editing", () => {
  // A desktop window with the note lane in the middle leaves a free margin.
  const lane = rect(400, 60, 600, 800);
  const block = rect(400, 300, 600, 120);
  const placements = [
    { anchor: rect(500, 340, 180, 20), block, lane },
    { anchor: rect(400, 300, 40, 20), block, lane },
    { anchor: rect(950, 410, 40, 20), block, lane }
  ];
  for (const input of placements) {
    const placed = resolveFormatToolbarPlacement({ ...input, size, viewport });
    const bar = rect(placed.left, placed.top, size.width, size.height);
    assert.equal(
      overlaps(bar, block),
      false,
      `bar ${JSON.stringify(bar)} covers the edited block (docked=${placed.docked})`
    );
  }
});

test("a narrow phone lane still puts the bar clear of the edited block", () => {
  const mobile = { left: 0, top: 0, width: 400, height: 800 };
  const lane = rect(20, 40, 360, 740);
  // The block fills the whole lane: no margin fits, so the bar must go above or
  // below it rather than over the caret line.
  const block = rect(20, 100, 360, 600);
  const placed = resolveFormatToolbarPlacement({
    anchor: rect(30, 300, 120, 20),
    block,
    lane,
    size: { width: 300, height: 36 },
    viewport: mobile
  });
  const bar = rect(placed.left, placed.top, 300, 36);
  assert.equal(overlaps(bar, block), false, `bar ${JSON.stringify(bar)} covers the block on mobile`);
  assert.ok(["above-block", "below-block", "anchor"].includes(placed.docked));
});

test("placements always stay inside the visible viewport", () => {
  const cases = [
    { anchor: rect(1390, 890, 20, 20), block: rect(1200, 860, 190, 30), lane: rect(0, 0, 1400, 900) },
    { anchor: rect(0, 0, 20, 20), block: rect(0, 0, 40, 30), lane: rect(0, 0, 1400, 900) },
    { anchor: rect(200, 450, 20, 20), block: null, lane: null }
  ];
  for (const input of cases) {
    const placed = resolveFormatToolbarPlacement({ ...input, size, viewport });
    assert.ok(placed.left >= FORMAT_TOOLBAR_MARGIN_GAP, `left ${placed.left} escaped the viewport`);
    assert.ok(placed.top >= FORMAT_TOOLBAR_MARGIN_GAP, `top ${placed.top} escaped the viewport`);
    assert.ok(placed.left + size.width <= viewport.width - FORMAT_TOOLBAR_MARGIN_GAP, "bar overflows right");
    assert.ok(placed.top + size.height <= viewport.height - FORMAT_TOOLBAR_MARGIN_GAP, "bar overflows bottom");
  }
});

test("a free margin is preferred over sitting above or below the block", () => {
  const lane = rect(200, 60, 600, 800);
  const placed = resolveFormatToolbarPlacement({
    anchor: rect(300, 300, 120, 20),
    block: rect(200, 260, 600, 120),
    lane,
    size,
    viewport
  });
  assert.equal(placed.docked, "margin");
  assert.ok(placed.left >= lane.left + lane.width + FORMAT_TOOLBAR_MARGIN_GAP - 1);
});

test("block avoidance leaves the documented gap", () => {
  const lane = rect(20, 40, 360, 740);
  const block = rect(20, 300, 360, 200);
  const above = resolveFormatToolbarPlacement({
    anchor: rect(40, 320, 100, 20),
    block,
    lane,
    size: { width: 300, height: 36 },
    viewport: { left: 0, top: 0, width: 400, height: 800 }
  });
  if (above.docked === "above-block") {
    assert.ok(above.top + 36 <= block.top - FORMAT_TOOLBAR_BLOCK_GAP + 1);
  } else if (above.docked === "below-block") {
    assert.ok(above.top >= block.bottom + FORMAT_TOOLBAR_BLOCK_GAP - 1);
  }
});

test("edit-md drags stay taps below the threshold", () => {
  const anchor = 40;
  const posAtCoords = () => 60;
  assert.equal(resolveEditMdDragSelection({
    anchor,
    startClient: { x: 100, y: 100 },
    clientPoint: { x: 101, y: 101 },
    posAtCoords
  }), null);
  const dragged = resolveEditMdDragSelection({
    anchor,
    startClient: { x: 100, y: 100 },
    clientPoint: { x: 100 + EDIT_MD_DRAG_THRESHOLD_PX + 5, y: 100 },
    posAtCoords
  });
  assert.deepEqual(dragged, { anchor: 40, head: 60, reversed: false });
});

test("dragging backwards reports a reversed selection", () => {
  const selection = resolveEditMdDragSelection({
    anchor: 90,
    startClient: { x: 200, y: 100 },
    clientPoint: { x: 40, y: 100 },
    posAtCoords: () => 12
  });
  assert.deepEqual(selection, { anchor: 90, head: 12, reversed: true });
});

test("a broken CodeMirror coordinate lookup never throws into the pointer handler", () => {
  const throwing = () => {
    throw new Error("no view");
  };
  assert.equal(resolveEditMdDragSelection({
    anchor: 10,
    startClient: { x: 0, y: 0 },
    clientPoint: { x: 30, y: 30 },
    posAtCoords: throwing
  }), null);
  assert.equal(resolveEditMdDragSelection({ anchor: NaN, clientPoint: { x: 1, y: 1 }, posAtCoords: () => 5 }), null);
  assert.equal(resolveEditMdDragSelection({ anchor: 1, clientPoint: null, posAtCoords: () => 5 }), null);
  // A move that resolves to the anchor position is not a selection change.
  assert.equal(resolveEditMdDragSelection({
    anchor: 7,
    startClient: { x: 0, y: 0 },
    clientPoint: { x: 50, y: 50 },
    posAtCoords: () => 7
  }), null);
});

test("edit-md drag ownership needs both an anchor and a pointer id", () => {
  assert.equal(editMdDragIsActive(null), false);
  assert.equal(editMdDragIsActive({ anchor: 3 }), false);
  assert.equal(editMdDragIsActive({ anchor: 3, pointerId: 1 }), true);
  assert.equal(editMdDragIsActive({ anchor: NaN, pointerId: 1 }), false);
});

test("floating controls are hosted on body for plain note surfaces only", async () => {
  const source = await readFile(new URL("../src/notedraw-plugin.js", import.meta.url), "utf8");
  const fn = source.slice(
    source.indexOf("function shouldUseBodyFloatingControls("),
    source.indexOf("function isMobileRuntime(")
  );
  // Both plain surfaces move to body; the leaf's `contain: strict` hijacks
  // `position: fixed`, which is issue #6.
  assert.match(fn, /surfaceType !== "preview" && surfaceType !== "source"/);
  assert.match(fn, /return true;/);
  assert.doesNotMatch(fn, /isMobileRuntime\(\) &&/);
  // Body-hosted controls need the marker class the stylesheet keys off.
  assert.match(source, /if \(parent === activeDocument\.body\) \{\s*element\.addClass\("notedraw-body-control"\);/);
});

test("the canvas lift rule leaves CodeMirror's own layers alone", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  const rule = css.slice(
    css.indexOf(".notedraw-shell.has-notedraw-canvas > :not(.notedraw-underlay-canvas)"),
    css.indexOf("position: relative;", css.indexOf(".notedraw-shell.has-notedraw-canvas > :not(.notedraw-underlay-canvas)"))
  );
  // `position: relative` on `.cm-cursorLayer` / `.cm-vimCursorLayer` broke the
  // Vim cursor (issue #5), so CodeMirror internals are excluded by class prefix.
  assert.match(rule, /:not\(\[class\*="cm-"\]\)/);
});
