import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/notedraw-plugin.js", import.meta.url);
const stylesUrl = new URL("../styles.css", import.meta.url);
const versionsUrl = new URL("../versions.json", import.meta.url);

test("parallel rows scroll independently and keep task controls clear", async () => {
  const [source, styles] = await Promise.all([readFile(sourceUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  const pending = source.slice(source.indexOf("  updatePendingSelectionTap("), source.indexOf("  applyPendingSelectionTap("));

  assert.match(source, /type: "scroll-row"/);
  assert.match(pending, /pending\.scrollRow\.scrollLeft = pending\.scrollStartLeft - deltaX/);
  assert.match(styles, /\.notedraw-md-grid-row[\s\S]*overflow-x: auto/);
  assert.match(styles, /\.notedraw-md-grid > \.notedraw-md-grid-item \+ \.notedraw-md-grid-item::before[\s\S]*left: -12px/);
});

test("one frozen inline allocation is shared by preview and commit", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const allocation = source.slice(source.indexOf("  markdownDropInlineAllocation("), source.indexOf("  async commitDraggedMarkdownBlocks("));
  const preview = source.slice(source.indexOf("  applyDraggedMarkdownDomPreview("), source.indexOf("  restoreDraggedNoteFlowLivePreview("));
  const commit = source.slice(source.indexOf("  async commitDraggedMarkdownBlocks("), source.indexOf("  updateDraggedElementGroupMembership("));

  assert.match(allocation, /drop\?\.inlineAllocationKey === key[\s\S]*return drop\.inlineAllocation/);
  assert.match(preview, /markdownDropInlineAllocation\(drop, targetBlock, moving\)/);
  assert.match(commit, /markdownDropInlineAllocation\(drop, targetBlock, moving\)/);
  assert.match(source, /previewOrderChanged[\s\S]*!previewStructureChanged[\s\S]*!previewOrderChanged/);
});

test("floating Markdown follows one cached float box and bypasses NoteFlow sorting", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const move = source.slice(source.indexOf("  moveSelectedStroke("), source.indexOf("  finishSelectedStrokeDrag("));
  const finish = source.slice(source.indexOf("  finishSelectedStrokeDrag("), source.indexOf("  cancelSelectedStrokeDrag("));

  assert.match(move, /updateDraggedFloatingMarkdownBlocks\(dragEvent, false\)/);
  assert.match(move, /if \(this\.draggedNoteFlowMarkdownStates\(\)\.length\)[\s\S]*queueMarkdownBlockDropTarget/);
  assert.match(source, /state\.previewFloatBox = normalizeMarkdownFloatBox/);
  assert.match(finish, /state\.block\.floatBox = \{ \.\.\.state\.previewFloatBox \}/);
});

test("selected connector endpoints can reconnect, commit, and cancel", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const reconnect = source.slice(source.indexOf("  findSelectedConnectorEndpointAt("), source.indexOf("  findSnapElementIdAtPoint("));
  const pointerMove = source.slice(source.indexOf("  onPointerMove("), source.indexOf("  onPointerUp("));
  const pointerUp = source.slice(source.indexOf("  onPointerUp("), source.indexOf("  finishPointerInteraction("));

  assert.match(reconnect, /startConnectorReconnectGesture[\s\S]*updateConnectorReconnectGesture[\s\S]*finishConnectorReconnectGesture[\s\S]*cancelConnectorReconnectGesture/);
  assert.match(reconnect, /findSnapElementIdAtPoint\(point, oppositeId/);
  assert.match(reconnect, /recordDrawingHistory\(reconnect\.historyBefore\)/);
  assert.match(pointerMove, /connectorReconnect[\s\S]*updateConnectorReconnectGesture/);
  assert.match(pointerUp, /connectorReconnect[\s\S]*finishConnectorReconnectGesture/);
});

test("release history retains 3.6.20 compatibility", async () => {
  const versions = JSON.parse(await readFile(versionsUrl, "utf8"));
  assert.equal(versions["3.6.20"], "1.5.0");
});
