import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/notedraw-plugin.js", import.meta.url);
const manifestUrl = new URL("../manifest.json", import.meta.url);

test("floating Markdown and connector selection frames redraw from live drag geometry", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const move = source.slice(source.indexOf("  moveSelectedStroke("), source.indexOf("  finishSelectedStrokeDrag("));
  const frame = source.slice(source.indexOf("  getSelectedFrameCanvasRect("), source.indexOf("  getVisibleSelectionFrameCanvasRect("));

  assert.match(move, /const movedFloatingMarkdown = this\.updateDraggedFloatingMarkdownBlocks\(dragEvent, false\)/);
  assert.match(move, /this\.invalidateSelectionFrameSnapshot\(\);[\s\S]*movedFloatingMarkdown[\s\S]*requestRender/);
  assert.match(frame, /this\.draggingStroke[\s\S]*this\.getSelectedStrokeBounds\(\)/);
});

test("owned blank space is restricted to the owner's real horizontal bounds", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const hit = source.slice(source.indexOf("  findOwnedBlankSpaceStrokeAtClientPoint("), source.indexOf("  findStrokesInSelection("));

  assert.match(hit, /const ownerBounds = getStrokeBounds/);
  assert.match(hit, /ownerRect,[\s\S]*selectOwnedBlankSpaceCandidate/);
});

test("group selection only hits the visible frame border", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const pointer = source.slice(source.indexOf("  onPointerDown("), source.indexOf("  onPointerMove("));
  const groups = source.slice(source.indexOf("  findBoxedElementGroupAtPoint("), source.indexOf("  isElementGroupFullySelected("));

  assert.match(pointer, /lockedGroupFrameHit = this\.toolMode === TOOL_SELECT && hitStrokeIndex < 0 && !markdownSelectionCandidate/);
  assert.match(groups, /elementGroupFrameBorderContains/);
  assert.match(groups, /return !\(hit\.x > innerLeft && hit\.x < innerRight && hit\.y > innerTop && hit\.y < innerBottom\)/);
  assert.doesNotMatch(groups, /hitsVisibleEmptyArea/);
  assert.doesNotMatch(pointer, /scrollRow\?\.scrollWidth > scrollRow\.clientWidth/);
});

test("commands require a visible frame and are cleared when the frame is removed", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const command = source.slice(source.indexOf("  selectedCommandTarget("), source.indexOf("  selectedFlowModeElements("));
  const execute = source.slice(source.indexOf("  executeElementCommand("), source.indexOf("  startSelectionDrag("));
  const unbox = source.slice(source.indexOf("  toggleSelectedElementBox("), source.indexOf("  elementFramePaddingPx("));

  assert.match(command, /elementHasCommandFrame[\s\S]*setSelectedElementCommand[\s\S]*!this\.elementHasCommandFrame\(item\)/);
  assert.match(execute, /!this\.elementHasCommandFrame\(element\)[\s\S]*return false/);
  assert.match(unbox, /clearElementGroupCommands\(group\.id\)[\s\S]*group\.boxed = false/);
});

test("release metadata is 3.6.21", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  assert.equal(manifest.version, "3.6.21");
});
