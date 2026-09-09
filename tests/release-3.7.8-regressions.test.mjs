import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolveDragDropHorizontalIntent } from "../src/markdown-block-layout.mjs";

const sourceUrl = new URL("../src/notedraw-plugin.js", import.meta.url);

test("a pointer on the target's right half always previews a parallel row", () => {
  const target = {
    targetLeft: 300,
    targetRight: 700,
    laneLeft: 0,
    laneRight: 1000,
    draggedLeft: 120,
    horizontalRoom: true,
    requireRightIntent: true
  };

  assert.equal(resolveDragDropHorizontalIntent({ ...target, clientX: 501 }), "inline-right");
  assert.equal(resolveDragDropHorizontalIntent({ ...target, clientX: 700 }), "inline-right");
  assert.equal(resolveDragDropHorizontalIntent({ ...target, clientX: 900 }), "inline-right");
  assert.equal(resolveDragDropHorizontalIntent({ ...target, clientX: 499 }), "vertical");
});

test("the line-start magnet stays on the row the pointer is actually over", () => {
  const parkedAtGutter = {
    targetLeft: 300,
    targetRight: 700,
    laneLeft: 0,
    laneRight: 1000,
    draggedLeft: 2,
    horizontalRoom: true,
    requireRightIntent: true,
    clientX: 380
  };

  assert.equal(resolveDragDropHorizontalIntent({
    ...parkedAtGutter,
    clientY: 200,
    targetTop: 180,
    targetBottom: 220
  }), "line-start");
  // Same left-edge magnet, pointer moved to a different row: the parallel row
  // must not follow it (this made dragged rows snap back and flicker).
  assert.equal(resolveDragDropHorizontalIntent({
    ...parkedAtGutter,
    clientY: 520,
    targetTop: 180,
    targetBottom: 220
  }), "vertical");
});

test("horizontal intent calls report the pointer row to the resolver", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const intents = source.match(/resolveDragDropHorizontalIntent\(\{[\s\S]*?\n    \}\)/g) || [];

  assert.ok(intents.length >= 3);
  for (const call of intents) {
    assert.match(call, /clientX,/);
    assert.match(call, /clientY,/);
    assert.match(call, /targetTop:/);
    assert.match(call, /targetBottom:/);
  }
});

test("the parallel keep-band stays proportional to the block it belongs to", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.ok(source.includes("const verticalTolerance = clamp(previousHeight * 0.85, 24, 96);"));
});

test("task checkbox mutations capture the parallel row before the direct drag branch", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const pointerDown = source.slice(
    source.indexOf("  onPreviewSecondPointerDown(event) {"),
    source.indexOf("  isReadingPreviewGesture(event) {")
  );
  const readingClick = source.slice(
    source.indexOf("  onReadingClick(event) {"),
    source.indexOf("  canZoomReadingSurface() {")
  );
  const directBranch = "if (this.active && this.toolMode === TOOL_SELECT && event.target !== this.canvas && directTaskBlock) {";
  const capture = "this.rememberMarkdownIdentityMutation(event);";

  assert.ok(pointerDown.includes(capture));
  assert.ok(pointerDown.includes(directBranch));
  assert.ok(pointerDown.indexOf(capture) < pointerDown.indexOf(directBranch));
  assert.ok(readingClick.includes(capture));
});
