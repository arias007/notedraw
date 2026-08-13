import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/notedraw-plugin.js", import.meta.url);

test("high-frequency interaction frames avoid a full Markdown remap", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const requestStart = source.indexOf("  requestRender(refreshDom = false) {");
  const requestSource = source.slice(requestStart, source.indexOf("  cancelRenderFrame()", requestStart));
  const interactionStart = source.indexOf("  renderInteractionFrame() {");
  const interactionSource = source.slice(interactionStart, source.indexOf("  renderCanvas()", interactionStart));
  const fullRenderStart = source.indexOf("  render() {");
  const fullRenderSource = source.slice(fullRenderStart, source.indexOf("  renderInteractionFrame()", fullRenderStart));
  const dragStart = source.indexOf("  moveSelectedStroke(event) {");
  const dragSource = source.slice(dragStart, source.indexOf("  finishSelectedStrokeDrag", dragStart));
  const resizeStart = source.indexOf("  moveSelectedStrokeResize(event) {");
  const resizeSource = source.slice(resizeStart, source.indexOf("  applySelectedStrokeResize", resizeStart));

  assert.match(requestSource, /refreshDom === "interaction"/);
  assert.match(requestSource, /shouldRefreshDom[\s\S]*this\.render\(\)[\s\S]*shouldRefreshInteraction[\s\S]*this\.renderInteractionFrame\(\)/);
  assert.match(interactionSource, /this\.refreshMarkdownBlockPresentation\(\)/);
  assert.match(interactionSource, /this\.updateEmbedLayer\(\{ indexes: embedIndexes \}\)/);
  assert.doesNotMatch(interactionSource, /syncMarkdownBlockPresentation|querySelectorAll/);
  assert.match(fullRenderSource, /this\.syncMarkdownBlockPresentation\(\)/);
  assert.match(dragSource, /requestRender\(this\.selectionHasDomStrokes\(\) \? "interaction" : false\)/);
  assert.match(dragSource, /if \(this\.dragLastPointerEvent === event\) \{\s*return;/);
  assert.match(resizeSource, /requestRender\(this\.selectionHasDomStrokes\(\) \? "interaction" : false\)/);
});

test("scoped embed refreshes update selected nodes without pruning the full layer", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const start = source.indexOf("  updateEmbedLayer(options = {}) {");
  const updateSource = source.slice(start, source.indexOf("  renderEmbedNode", start));

  assert.match(updateSource, /Array\.isArray\(options\.indexes\)/);
  assert.match(updateSource, /scopedIndexes\.map\(\(index\) => \[index, this\.drawingData\.strokes\[index\]\]\)/);
  assert.match(updateSource, /if \(!scopedIndexes\) \{[\s\S]*this\.embedNodes\.delete\(key\)/);
});

test("ordinary drags stay light and NoteFlow resizes use one fresh interaction frame", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const queueStart = source.indexOf("  queueDraggedNoteFlowRefresh(indexes) {");
  const queueSource = source.slice(queueStart, source.indexOf("  refreshDraggedNoteFlowAnchors", queueStart));
  const resizeStart = source.indexOf("  applySelectedStrokeResize(point) {");
  const resizeSource = source.slice(resizeStart, source.indexOf("  finishSelectedStrokeResize", resizeStart));
  const resizeQueueStart = source.indexOf("  queueSelectedResizeNoteFlowLayout() {");
  const resizeQueueSource = source.slice(resizeQueueStart, source.indexOf("  finishSelectedStrokeResize", resizeQueueStart));

  assert.match(queueSource, /let queued = false/);
  assert.match(queueSource, /stroke\?\.noteFlow\?\.enabled[\s\S]*queued = true/);
  assert.match(queueSource, /if \(queued && !this\.draggingStroke\) \{\s*this\.scheduleNoteFlowLayout\(\)/);
  assert.match(resizeSource, /if \(Array\.from\(this\.resizeSelectionOriginalStrokes\.keys\(\)\)\.some\([\s\S]*noteFlow\?\.enabled\)\) \{\s*this\.queueSelectedResizeNoteFlowLayout\(\)/);
  assert.match(resizeQueueSource, /scheduleNoteFlowLayout\(\{ operation: true, defer: true \}\)/);
  assert.match(resizeQueueSource, /this\.resizeNoteFlowFrameId !== null[\s\S]*window\.requestAnimationFrame\([\s\S]*this\.flushSelectedResizeNoteFlowLayout\(\)/);
  assert.match(resizeQueueSource, /this\.previewEl\?\.getBoundingClientRect\?\.\(\);\s*this\.noteFlowSettledRowExtents = [\s\S]*new Map\(\);\s*const changed = this\.applyNoteFlowLayout\(\);\s*const aligned = this\.alignNoteFlowStrokesToReservedRows\(null, \{ interaction: true \}\)/);
  assert.match(resizeQueueSource, /window\.cancelAnimationFrame\(this\.resizeNoteFlowFrameId\)/);
});

test("inline drag preview keeps a stable semantic slot instead of rebuilding on pointer jitter", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const placementStart = source.indexOf("  updateDraggedNoteFlowPlacement(clientX, clientY) {");
  const placementSource = source.slice(placementStart, source.indexOf("  syncMarkdownDropFromNoteFlowPlacement", placementStart));
  const domStart = source.indexOf("  applyDraggedNoteFlowAnchorDomPreview(placement, drop = null) {");
  const domSource = source.slice(domStart, source.indexOf("  applyDraggedMarkdownDomPreview", domStart));

  assert.match(placementSource, /const sameSemanticSlot = [\s\S]*previous\?\.flowOrder === flowOrder/);
  assert.match(placementSource, /if \(sameSemanticSlot\) \{\s*flowBoundary = previous\.boundary;\s*inlineBoundary = previous\.inlineBoundary/);
  assert.match(placementSource, /const previewSignature = \[[\s\S]*candidate\?\.blockKey \|\| ""[\s\S]*\.join\(":"\)/);
  assert.doesNotMatch(placementSource.slice(placementSource.indexOf("const previewSignature"), placementSource.indexOf("const preserveDomPreview")), /inlineBoundary|boundary/);
  assert.match(placementSource, /preserveDomPreview[\s\S]*applyDraggedNoteFlowLivePreview\(this\.dragNoteFlowPlacement, \{ preserveDom: preserveDomPreview \}\)/);
  assert.match(domSource, /const row = drop\?\.row \|\| this\.markdownDropRowMetrics\(target, movingElements\);[\s\S]*const span = row\.span/);
  assert.doesNotMatch(domSource, /targetWidth|Math\.floor\(targetWidth \/ laneWidth/);
});

test("selection filter cycles perform one full presentation pass", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const start = source.indexOf("  cycleSelectionFilter() {");
  const cycleSource = source.slice(start, source.indexOf("  selectedMindMapSource", start));

  assert.doesNotMatch(cycleSource, /syncMarkdownBlockPresentation/);
  assert.match(cycleSource, /this\.syncSelectionMenuButtons\(\);\s*this\.render\(\);/);
});
