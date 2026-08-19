import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/notedraw-plugin.js", import.meta.url);
const stylesUrl = new URL("../styles.css", import.meta.url);

test("first movement over an element starts element dragging rather than area selection", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const pending = source.slice(source.indexOf("  updatePendingSelectionTap("), source.indexOf("  applyPendingSelectionTap("));

  assert.match(pending, /"select-stroke"[\s\S]*"select-markdown"[\s\S]*"select-group"/);
  assert.match(pending, /pending\.type === "select-stroke"[\s\S]*setSelectedStrokes/);
  assert.match(pending, /pending\.type === "select-markdown"[\s\S]*selectMarkdownBlock/);
  assert.match(pending, /startSelectedStrokeDrag[\s\S]*moveSelectedStroke/);
  assert.doesNotMatch(pending, /startSelectionDrag/);
});

test("resize handles win hit testing and activate with the precise drag threshold", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const pointerMove = source.slice(source.indexOf("  onPointerMove("), source.indexOf("  onPointerUp("));
  const resize = source.slice(source.indexOf("  moveSelectedStrokeResize("), source.indexOf("  resizeEventToPoint("));

  assert.ok(pointerMove.indexOf("this.resizingSelection") < pointerMove.indexOf("this.pendingSelectionTap"));
  assert.match(resize, /selectedDragActivationDistancePx\(event\.pointerType\)/);
  assert.doesNotMatch(source, /markdownSelectionCandidate && !markdownCandidateSelected && hitStrokeIndex < 0[\s\S]{0,80}resizeHandle = null/);
});

test("hard text watercolor follows its dragged Markdown owner on every preview frame", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const move = source.slice(source.indexOf("  moveSelectedStroke("), source.indexOf("  finishSelectedStrokeDrag("));
  const sync = source.slice(source.indexOf("  syncDraggedTextHighlightAnchors("), source.indexOf("  restoreTextHighlightAnchorsForOwners("));

  assert.match(move, /syncDraggedTextHighlightAnchors\(\)/);
  assert.match(sync, /dragMarkdownOriginalElements[\s\S]*restoreTextHighlightAnchorsForOwners\(ownerIds\)/);
  assert.match(source, /collectTextLineRectsBelowCanvas\(this\.canvas, this\.previewEl, ownerIds\)/);
});

test("parallel rows support real touch and wheel horizontal scrolling", async () => {
  const [source, styles] = await Promise.all([readFile(sourceUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  const pending = source.slice(source.indexOf("  updatePendingSelectionTap("), source.indexOf("  applyPendingSelectionTap("));

  assert.match(source, /parallelScrollRowAt\(clientX, clientY/);
  assert.match(pending, /scrollingRow[\s\S]*scrollLeft = pending\.scrollStartLeft - deltaX/);
  assert.match(source, /row\.scrollLeft \+= horizontalDelta/);
  assert.match(styles, /@media \(max-width: 600px\)[\s\S]*grid-template-columns: repeat\(12, minmax\(28px, 1fr\)\)/);
});

test("connector relationship groups refresh before stroke or Markdown selection", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const markdownSelection = source.slice(source.indexOf("  selectMarkdownBlock("), source.indexOf("  toggleMarkdownBlockSelection("));
  const strokeSelection = source.slice(source.indexOf("  setSelectedStrokes("), source.indexOf("  toggleStrokeSelection("));

  assert.match(markdownSelection, /syncConnectorElementGroups\(\)/);
  assert.match(strokeSelection, /syncConnectorElementGroups\(\)/);
  assert.match(source, /groupFrameShouldBeVisible\(groupId\)[\s\S]*isStrokeSelected[\s\S]*selectedMarkdownBlockIds/);
});
