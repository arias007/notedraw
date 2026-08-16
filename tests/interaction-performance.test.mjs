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
  assert.match(interactionSource, /if \(this\.getSelectedMarkdownBlocks\(\)\.length \|\| this\.usesDraggedNoteFlowPlacement\(\)\) \{[\s\S]*this\.refreshMarkdownBlockPresentation\(\)/);
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

test("ordinary drags stay light while NoteFlow resize reflows once per animation frame", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const queueStart = source.indexOf("  queueDraggedNoteFlowRefresh(indexes) {");
  const queueSource = source.slice(queueStart, source.indexOf("  refreshDraggedNoteFlowAnchors", queueStart));
  const resizeStart = source.indexOf("  applySelectedStrokeResize(point) {");
  const resizeSource = source.slice(resizeStart, source.indexOf("  finishSelectedStrokeResize", resizeStart));
  const finishStart = source.indexOf("  finishSelectedStrokeResize(event) {");
  const finishSource = source.slice(finishStart, source.indexOf("  cancelSelectedStrokeResize", finishStart));

  assert.match(queueSource, /let queued = false/);
  assert.match(queueSource, /stroke\?\.noteFlow\?\.enabled[\s\S]*queued = true/);
  assert.match(queueSource, /if \(queued && !this\.draggingStroke\) \{\s*this\.scheduleNoteFlowLayout\(\)/);
  assert.match(resizeSource, /this\.refreshMarkdownBlockPresentation\(originalMarkdownBlocks\.keys\(\)\)/);
  assert.match(resizeSource, /this\.queueSelectedResizeNoteFlowLayout\(\)/);
  assert.match(resizeSource, /selectedResizeAffectsNoteFlowLayout\(\)[\s\S]*resizeSelectionOriginalMarkdownBlocks\?\.size/);
  assert.match(resizeSource, /scheduleNoteFlowLayout\(\{ operation: true, defer: true \}\)/);
  assert.match(resizeSource, /window\.requestAnimationFrame\(\(\) => \{[\s\S]*this\.flushSelectedResizeNoteFlowLayout\(\)/);
  assert.match(resizeSource, /this\.previewEl\?\.getBoundingClientRect\?\.\(\)/);
  assert.match(resizeSource, /this\.noteFlowSettledRowExtents = \/\* @__PURE__ \*\/ new Map\(\)/);
  assert.match(resizeSource, /this\.applyNoteFlowLayout\(\)/);
  assert.match(resizeSource, /alignNoteFlowStrokesToReservedRows\(null, \{ interaction: true \}\)/);
  assert.match(resizeSource, /if \(this\.noteFlowFrameId !== null\) \{[\s\S]*window\.cancelAnimationFrame\(this\.noteFlowFrameId\)/);
  assert.match(resizeSource, /this\.flushSelectedResizeNoteFlowLayout\(\{ immediate: true \}\)/);
  assert.match(resizeSource, /const maxPasses = 3/);
  assert.match(resizeSource, /pass \+ 1 < maxPasses[\s\S]*this\.previewEl\?\.getBoundingClientRect\?\.\(\)/);
  assert.match(resizeSource, /const passChanged = layoutChanged \|\| aligned;[\s\S]*if \(!passChanged\) \{/);
  const flowStart = source.indexOf("  applyNoteFlowLayout() {");
  const flowSource = source.slice(flowStart, source.indexOf("  markNoteFlowLayoutMutation", flowStart));
  assert.match(flowSource, /const liveBounds = this\.resizingSelection[\s\S]*getStrokeBounds\(item\.stroke/);
  assert.match(flowSource, /const liveHeight = Math\.max\([\s\S]*\(liveBounds \|\| item\.bounds\)\.maxY[\s\S]*const stableHeight = this\.resizingSelection[\s\S]*liveHeight/);
  assert.match(flowSource, /if \(this\.resizingSelection\) \{[\s\S]*this\.noteFlowSettledRowExtents = \/\* @__PURE__ \*\/ new Map\(\)/);
  assert.match(flowSource, /preferCurrent: Boolean\(normalizeNoteFlow\(stroke\.noteFlow\)\?\.positionBasis\)[\s\S]*this\.resizingSelection/);
  assert.match(resizeSource, /window\.cancelAnimationFrame\(this\.resizeNoteFlowFrameId\)/);
  assert.match(finishSource, /this\.cancelSelectedResizeNoteFlowLayout\(\);\s*this\.flushSelectedResizeNoteFlowLayout\(\)/);
  assert.match(finishSource, /const resizedMarkdownBlocks = Boolean\(this\.resizeSelectionOriginalMarkdownBlocks\?\.size\)/);
  assert.match(finishSource, /if \(resizedMarkdownBlocks \|\| resizedNoteFlowStrokes\)/);
});

test("selection filter cycles perform one full presentation pass", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const start = source.indexOf("  cycleSelectionFilter() {");
  const cycleSource = source.slice(start, source.indexOf("  selectedMindMapSource", start));

  assert.doesNotMatch(cycleSource, /syncMarkdownBlockPresentation/);
  assert.match(cycleSource, /this\.syncSelectionMenuButtons\(\);\s*this\.render\(\);/);
});
