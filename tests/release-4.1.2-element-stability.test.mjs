import test from "node:test";
import assert from "node:assert/strict";
import {
  createElementLayout,
  projectElementLayout
} from "../src/element-layout.mjs";

// Real geometry captured from the vault (常用/日记/2026-10-26.md, 360pt lane).
const realStroke = {
  box: { x: 188.7714969828714, y: 178.3906707763672, width: 40.665707001943986, height: 196.4961962086286 },
  surfaceWidth: 360,
  contentLeft: 24.000001907348633,
  contentWidth: 301.14288330078125,
  documentHeight: 638,
  topLeftLine: 4.859
};

function realLayout() {
  return createElementLayout({
    id: "el-real",
    bounds: {
      minX: realStroke.box.x,
      minY: realStroke.box.y,
      maxX: realStroke.box.x + realStroke.box.width,
      maxY: realStroke.box.y + realStroke.box.height
    },
    canvasWidth: realStroke.surfaceWidth,
    canvasHeight: realStroke.documentHeight,
    frame: { left: realStroke.contentLeft, width: realStroke.contentWidth },
    viewportHeight: 627,
    sourcePath: "常用/日记/2026-10-26.md",
    cornerLocations: {
      topLeft: { path: "常用/日记/2026-10-26.md", line: realStroke.topLeftLine, lineConfidence: 0.96 },
      topRight: { path: "常用/日记/2026-10-26.md", line: realStroke.topLeftLine, lineConfidence: 0.96 },
      bottomLeft: { path: "常用/日记/2026-10-26.md" },
      bottomRight: { path: "常用/日记/2026-10-26.md" }
    }
  });
}

function target(overrides = {}) {
  return {
    canvasWidth: realStroke.surfaceWidth,
    canvasHeight: realStroke.documentHeight,
    frame: { left: realStroke.contentLeft, width: realStroke.contentWidth },
    viewportHeight: 627,
    ...overrides
  };
}

test("a document that grows taller must not lift or drop a floating element", () => {
  const layout = realLayout();
  const before = projectElementLayout(layout, target());
  // Another Markdown block grew, and this element's anchor line sits 37px lower
  // than it used to because the line map is derived from rendered block rects.
  const after = projectElementLayout(layout, target({
    canvasHeight: realStroke.documentHeight + 40,
    lineToCanvasY: (path, line) => (line >= 4 ? 215 : 0),
    allowLineAnchor: false,
    sizeFollowsContentWidthOnly: true
  }));
  assert.ok(Math.abs(after.y - before.y) < 0.01, `y drifted: ${before.y} -> ${after.y}`);
  assert.ok(Math.abs(after.height - before.height) < 0.01, `height drifted: ${before.height} -> ${after.height}`);
  assert.ok(Math.abs(after.width - before.width) < 0.01, `width drifted: ${before.width} -> ${after.width}`);
});

test("without the stability options the same change still drags the element", () => {
  // Documents the pre-4.1.2 coupling so the options above cannot silently
  // become no-ops: text anchors plus document-height scaling move the element.
  const layout = realLayout();
  const before = projectElementLayout(layout, target());
  const after = projectElementLayout(layout, target({
    canvasHeight: realStroke.documentHeight + 40,
    lineToCanvasY: (path, line) => (line >= 4 ? 215 : 0)
  }));
  assert.ok(Math.abs(after.y - before.y) > 1, "expected the legacy path to move the element");
});

test("projection stays idempotent across repeated layout passes", () => {
  const layout = realLayout();
  const first = projectElementLayout(layout, target({ canvasHeight: 700, allowLineAnchor: false, sizeFollowsContentWidthOnly: true }));
  const second = projectElementLayout(layout, target({ canvasHeight: 700, allowLineAnchor: false, sizeFollowsContentWidthOnly: true }));
  assert.deepEqual(first, second);
});

test("a narrower lane still reflows the element horizontally and in size", () => {
  const layout = realLayout();
  const narrow = projectElementLayout(layout, target({
    canvasWidth: 320,
    frame: { left: 16, width: 288 },
    allowLineAnchor: false,
    sizeFollowsContentWidthOnly: true
  }));
  const wide = projectElementLayout(layout, target({
    canvasWidth: 520,
    frame: { left: 32, width: 456 },
    allowLineAnchor: false,
    sizeFollowsContentWidthOnly: true
  }));
  assert.ok(narrow.width < wide.width, "element should shrink with the content lane");
  assert.ok(narrow.x < wide.x + 1, "element should move with the content lane");
  const narrowRatio = narrow.width / narrow.height;
  assert.ok(Math.abs(narrowRatio - wide.width / wide.height) < 0.02, "aspect ratio must stay stable");
});

test("note text identity ignores plugin writes but catches real edits", async () => {
  const { textContentHash, noteTextChanged } = await import("../src/note-text-hash.mjs");
  const text = "# 日记\n\n今天画了两笔。\n";
  assert.equal(textContentHash(text), textContentHash(text));
  // Appending NoteDraw's hidden link block must keep the hash identical only
  // when the visible text is untouched; a real edit must change it.
  assert.notEqual(textContentHash(text), textContentHash(`${text}再写一句\n`));
  assert.equal(noteTextChanged("", textContentHash(text)), false, "first run must not re-anchor");
  assert.equal(noteTextChanged(textContentHash(text), ""), false);
  assert.equal(noteTextChanged(textContentHash(text), textContentHash(text)), false);
  assert.equal(noteTextChanged(textContentHash(text), textContentHash(`${text}x`)), true);
});

test("the controller keeps floating ink absolute and only re-anchors after a text edit", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/notedraw-plugin.js", import.meta.url), "utf8");

  // Floating projection must opt out of text anchors and document-height sizing.
  assert.match(source, /const box = projectElementLayout\(layout, \{[\s\S]*?allowLineAnchor: allowTextAnchorsForPass,\s*sizeFollowsContentWidthOnly: true\s*\}\)/);
  // NoteFlow ink keeps its text anchors: it lives inside the Markdown flow.
  assert.match(source, /const layoutBox = projectElementLayout\(layout, \{[\s\S]*?preferDocumentFlow: isMobileRuntime\(\)\s*\}\)/);
  // The corrective pass is armed only by a real text change and cleared once run.
  assert.match(source, /const laneReflowed = previousLaneWidth > 0 && currentLaneWidth > 0[\s\S]*?const allowTextAnchorsForPass = this\.textAnchorPassPending === true \|\| laneReflowed;/);
  assert.match(source, /controller\.textAnchorPassPending = Boolean\(data\?\._notedrawTextChanged\);/);
  assert.match(source, /if \(allowTextAnchorsForPass\) \{[\s\S]*?this\.textAnchorPassPending = false;[\s\S]*?captureResponsiveAnchorsForIndexes\(indexes\)/);
  // Text identity comes from the note text, not from file stats.
  assert.match(source, /const text = await this\.app\.vault\.cachedRead\(realFile\);[\s\S]*?hash = textContentHash\(text\);/);
  assert.match(source, /const textChanged = noteTextChanged\(previousTextHash, textHash\);/);
});

test("a transient frame never overwrites good element geometry", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/notedraw-plugin.js", import.meta.url), "utf8");
  assert.match(source, /if \(previousLayout && !isStableResponsiveCaptureFrame\(this\.canvasWidth\(\), context\?\.frame\)\) \{\s*return previousLayout;/);
  // Repair also has to wait for a representative frame, otherwise a split pane
  // bakes its geometry into the drawing.
  assert.match(source, /const frameIsStable = isStableResponsiveCaptureFrame\(this\.canvasWidth\(\), context\.frame\);[\s\S]*const needsLayoutRepair = frameIsStable && Boolean\(existingLayout\)/);
});
